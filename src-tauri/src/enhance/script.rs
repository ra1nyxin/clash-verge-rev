use super::field::{use_lowercase, use_lowercase_owned};
use anyhow::{Context as _, Error, Result};
use boa_engine::{Context, JsString, JsValue, Source, native_function::NativeFunction};
use clash_verge_logging::{Type, logging_error};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_yaml_ng::Mapping;
use smartstring::alias::String;
use std::{
    io::{Read, Write as _},
    process::{Command, ExitCode, Stdio},
    sync::Arc,
    thread,
    time::Instant,
};

const MAX_OUTPUTS: usize = 1000;
const MAX_OUTPUT_SIZE: usize = 1024 * 1024; // 1MB
const MAX_JSON_SIZE: usize = 10 * 1024 * 1024; // 10MB
const MAX_SCRIPT_SIZE: usize = 1024 * 1024; // 1MB
const MAX_LOOP_ITERATIONS: u64 = 10_000_000;
const SCRIPT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const SCRIPT_WORKER_MEMORY_LIMIT: usize = 512 * 1024 * 1024;
const SCRIPT_WORKER_ARG: &str = "--internal-script-worker";
const MAX_WORKER_MESSAGE_SIZE: usize = MAX_JSON_SIZE * 2 + MAX_OUTPUT_SIZE;

#[derive(Serialize, Deserialize)]
struct ScriptWorkerRequest {
    script: String,
    config: Mapping,
    name: String,
}

#[derive(Serialize, Deserialize)]
struct ScriptWorkerResponse {
    result: std::result::Result<(Mapping, Vec<(String, String)>), std::string::String>,
}

pub async fn use_script(script: String, config: Mapping, name: String) -> Result<(Mapping, Vec<(String, String)>)> {
    let handle = tokio::task::spawn_blocking(move || run_script_worker(script, config, name));
    handle.await.context("script worker task panicked")?
}

fn read_pipe_limited(mut pipe: impl Read, limit: usize) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    pipe.by_ref().take((limit + 1) as u64).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        anyhow::bail!("script worker response exceeds {limit} bytes");
    }
    Ok(bytes)
}

#[cfg(unix)]
fn apply_script_worker_memory_limit(command: &mut Command) {
    use std::os::unix::process::CommandExt as _;

    // SAFETY: this closure only calls the async-signal-safe setrlimit between fork and exec.
    unsafe {
        command.pre_exec(|| {
            let limit = libc::rlimit {
                rlim_cur: SCRIPT_WORKER_MEMORY_LIMIT as libc::rlim_t,
                rlim_max: SCRIPT_WORKER_MEMORY_LIMIT as libc::rlim_t,
            };
            if libc::setrlimit(libc::RLIMIT_AS, &raw const limit) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
}

#[cfg(not(unix))]
fn apply_script_worker_memory_limit(_command: &mut Command) {}

#[cfg(windows)]
fn attach_script_worker_memory_limit(child: &std::process::Child) -> Result<std::os::windows::io::OwnedHandle> {
    use std::os::windows::io::{AsRawHandle as _, FromRawHandle as _, OwnedHandle};
    use windows_sys::Win32::{
        Foundation::HANDLE,
        System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOB_OBJECT_LIMIT_PROCESS_MEMORY, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        },
    };

    // SAFETY: every returned handle is immediately owned, and all pointers refer to live values.
    unsafe {
        let raw_job: HANDLE = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if raw_job.is_null() {
            return Err(std::io::Error::last_os_error()).context("failed to create script worker job");
        }
        let job = OwnedHandle::from_raw_handle(raw_job);
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_PROCESS_MEMORY;
        info.ProcessMemoryLimit = SCRIPT_WORKER_MEMORY_LIMIT;
        if SetInformationJobObject(
            job.as_raw_handle() as HANDLE,
            JobObjectExtendedLimitInformation,
            &mut info as *mut _ as *mut _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) == 0
        {
            return Err(std::io::Error::last_os_error()).context("failed to limit script worker memory");
        }
        if AssignProcessToJobObject(job.as_raw_handle() as HANDLE, child.as_raw_handle() as HANDLE) == 0 {
            return Err(std::io::Error::last_os_error()).context("failed to assign script worker job");
        }
        Ok(job)
    }
}

fn run_script_worker(script: String, config: Mapping, name: String) -> Result<(Mapping, Vec<(String, String)>)> {
    if script.len() > MAX_SCRIPT_SIZE {
        anyhow::bail!("script source exceeds {MAX_SCRIPT_SIZE} bytes");
    }
    let request = serde_json::to_vec(&ScriptWorkerRequest { script, config, name })?;
    if request.len() > MAX_WORKER_MESSAGE_SIZE {
        anyhow::bail!("script worker request exceeds {MAX_WORKER_MESSAGE_SIZE} bytes");
    }

    let mut command = Command::new(std::env::current_exe()?);
    command
        .arg(SCRIPT_WORKER_ARG)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt as _;
        command.creation_flags(0x0800_0000);
    }
    apply_script_worker_memory_limit(&mut command);

    let child = command.spawn().context("failed to start script worker")?;
    let mut child = scopeguard::guard(child, |mut child| {
        let _ = child.kill();
        let _ = child.wait();
    });
    #[cfg(windows)]
    let _worker_job = attach_script_worker_memory_limit(&child)?;
    child
        .stdin
        .take()
        .context("script worker stdin is unavailable")?
        .write_all(&request)?;

    let stdout = child.stdout.take().context("script worker stdout is unavailable")?;
    let stderr = child.stderr.take().context("script worker stderr is unavailable")?;
    let stdout_reader = thread::spawn(move || read_pipe_limited(stdout, MAX_WORKER_MESSAGE_SIZE));
    let stderr_reader = thread::spawn(move || read_pipe_limited(stderr, MAX_OUTPUT_SIZE));
    let deadline = Instant::now() + SCRIPT_TIMEOUT;

    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            anyhow::bail!("script execution timed out after {SCRIPT_TIMEOUT:?}");
        }
        thread::sleep(std::time::Duration::from_millis(20));
    };

    let stdout = stdout_reader.join().map_err(|_| anyhow::anyhow!("script worker stdout reader panicked"))??;
    let stderr = stderr_reader.join().map_err(|_| anyhow::anyhow!("script worker stderr reader panicked"))??;
    if !status.success() {
        anyhow::bail!("script worker failed: {}", std::string::String::from_utf8_lossy(&stderr));
    }

    let response: ScriptWorkerResponse = serde_json::from_slice(&stdout).context("invalid script worker response")?;
    response.result.map_err(anyhow::Error::msg)
}

pub(crate) fn run_script_worker_if_requested() -> Option<ExitCode> {
    if std::env::args().nth(1).as_deref() != Some(SCRIPT_WORKER_ARG) {
        return None;
    }

    let result = (|| -> Result<ScriptWorkerResponse> {
        let mut request = Vec::new();
        std::io::stdin()
            .take((MAX_WORKER_MESSAGE_SIZE + 1) as u64)
            .read_to_end(&mut request)?;
        if request.len() > MAX_WORKER_MESSAGE_SIZE {
            anyhow::bail!("script worker request is too large");
        }
        let request: ScriptWorkerRequest = serde_json::from_slice(&request)?;
        Ok(ScriptWorkerResponse {
            result: use_script_sync(request.script, &request.config, &request.name).map_err(|error| error.to_string()),
        })
    })();

    match result.and_then(|response| {
        serde_json::to_writer(std::io::stdout().lock(), &response)?;
        Ok(())
    }) {
        Ok(()) => Some(ExitCode::SUCCESS),
        Err(error) => {
            eprintln!("script worker error: {error:#}");
            Some(ExitCode::FAILURE)
        }
    }
}

fn use_script_sync(script: String, config: &Mapping, name: &String) -> Result<(Mapping, Vec<(String, String)>)> {
    if script.len() > MAX_SCRIPT_SIZE {
        anyhow::bail!("script source exceeds {MAX_SCRIPT_SIZE} bytes");
    }
    let mut context = Context::default();

    context
        .runtime_limits_mut()
        .set_loop_iteration_limit(MAX_LOOP_ITERATIONS);

    let outputs = Arc::new(Mutex::new(vec![]));
    let total_size = Arc::new(Mutex::new(0usize));

    let outputs_clone = Arc::clone(&outputs);
    let total_size_clone = Arc::clone(&total_size);

    let _ = context.register_global_builtin_callable("__verge_log__".into(), 2, unsafe {
        NativeFunction::from_closure(move |_: &JsValue, args: &[JsValue], context: &mut Context| {
            let level = args
                .first()
                .ok_or_else(|| boa_engine::JsError::from_opaque(JsString::from("Missing level argument").into()))?;
            let level = level.to_string(context)?;
            let level = level.to_std_string().map_err(|_| {
                boa_engine::JsError::from_opaque(JsString::from("Failed to convert level to string").into())
            })?;

            let data = args
                .get(1)
                .ok_or_else(|| boa_engine::JsError::from_opaque(JsString::from("Missing data argument").into()))?;
            let data = data.to_string(context)?;
            let data = data.to_std_string().map_err(|_| {
                boa_engine::JsError::from_opaque(JsString::from("Failed to convert data to string").into())
            })?;

            // 检查输出限制
            if outputs_clone.lock().len() >= MAX_OUTPUTS {
                return Err(boa_engine::JsError::from_opaque(
                    JsString::from("Maximum number of log outputs exceeded").into(),
                ));
            }

            let mut size = total_size_clone.lock();
            let new_size = *size + level.len() + data.len();
            if new_size > MAX_OUTPUT_SIZE {
                return Err(boa_engine::JsError::from_opaque(
                    JsString::from("Maximum output size exceeded").into(),
                ));
            }
            *size = new_size;
            drop(size);
            outputs_clone.lock().push((level.into(), data.into()));
            Ok(JsValue::undefined())
        })
    });

    let _ = context.eval(Source::from_bytes(
        r#"var console = Object.freeze({
        log(data){__verge_log__("log",JSON.stringify(data, null, 2))},
        info(data){__verge_log__("info",JSON.stringify(data, null, 2))},
        error(data){__verge_log__("error",JSON.stringify(data, null, 2))},
        debug(data){__verge_log__("debug",JSON.stringify(data, null, 2))},
        warn(data){__verge_log__("warn",JSON.stringify(data, null, 2))},
        table(data){__verge_log__("table",JSON.stringify(data, null, 2))},
      });"#,
    ));

    let config = use_lowercase(config);
    let config_str = serde_json::to_string(&config)?;
    if config_str.len() > MAX_JSON_SIZE {
        anyhow::bail!("Configuration size exceeds maximum allowed size");
    }

    // 仅处理 name 参数中的特殊字符
    let safe_name = escape_js_string_for_single_quote(name);
    if safe_name.len() > 1024 {
        anyhow::bail!("Name parameter too long");
    }

    let code = format!(
        r"try{{
        {script};
        JSON.stringify(main({config_str},'{safe_name}')||'')
      }} catch(err) {{
        `__error_flag__ ${{err.toString()}}`
      }}"
    );

    if let Ok(result) = context.eval(Source::from_bytes(code.as_str())) {
        if !result.is_string() {
            anyhow::bail!("main function should return object");
        }
        let result = result
            .to_string(&mut context)
            .map_err(|e| anyhow::anyhow!("Failed to convert JS result to string: {}", e))?;
        let result = result
            .to_std_string()
            .map_err(|_| anyhow::anyhow!("Failed to convert JS string to std string"))?;

        if result.len() > MAX_JSON_SIZE {
            anyhow::bail!("Script result exceeds maximum allowed size");
        }

        let res: Result<Mapping, Error> = parse_json_safely(&result);

        match res {
            Ok(config) => Ok((use_lowercase_owned(config), outputs.lock().to_vec())),
            Err(err) => {
                outputs
                    .lock()
                    .push(("exception".into(), "Script execution failed".into()));
                logging_error!(Type::Config, "Script execution error: {}. Script name: {}", err, name);
                Ok((config, outputs.lock().to_vec()))
            }
        }
    } else {
        anyhow::bail!("main function should return object");
    }
}

fn parse_json_safely(json_str: &str) -> Result<Mapping, Error> {
    if json_str.len() > MAX_JSON_SIZE {
        anyhow::bail!("JSON string too large");
    }

    let json_str = strip_outer_quotes(json_str);
    Ok(serde_json::from_str::<Mapping>(json_str)?)
}

// 安全地移除外层引号
fn strip_outer_quotes(s: &str) -> &str {
    let s = s.trim();

    if s.len() < 2 {
        return s;
    }

    if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')) {
        &s[1..s.len() - 1]
    } else {
        s
    }
}

// 安全地转义字符串
fn escape_js_string_for_single_quote(s: &str) -> String {
    // 限制处理的字符串长度
    if s.len() > 10240 {
        return s[..10240].replace('\\', "\\\\").replace('\'', "\\'").into();
    }

    s.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n") // 添加换行符转义
        .replace('\r', "\\r") // 添加回车转义
        .into()
}

#[test]
#[allow(unused_variables)]
#[allow(clippy::expect_used)]
fn test_script() {
    let script = r#"
    function main(config) {
      if (Array.isArray(config.rules)) {
        config.rules = [...config.rules, "add"];
      }
      console.log(config);
      config.proxies = ["111"];
      return config;
    }
  "#;

    let config = r"
    rules:
      - 111
      - 222
    tun:
      enable: false
    dns:
      enable: false
  ";

    let config = &serde_yaml_ng::from_str(config).expect("Failed to parse test config YAML");
    let (config, results) =
        use_script_sync(script.into(), config, &String::from("")).expect("Script execution should succeed in test");

    let _ = serde_yaml_ng::to_string(&config).expect("Failed to serialize config to YAML");
    let yaml_config_size = std::mem::size_of_val(&config);
    let box_yaml_config_size = std::mem::size_of_val(&Box::new(config));
    assert!(box_yaml_config_size < yaml_config_size);
}

// 测试特殊字符转义功能
#[test]
#[allow(clippy::expect_used)]
fn test_escape_unescape() {
    let test_string = r#"Hello "World"!\nThis is a test with \u00A9 copyright symbol."#;
    let escaped = escape_js_string_for_single_quote(test_string);
    println!("Original: {test_string}");
    println!("Escaped: {escaped}");

    let json_str = r#"{"key":"value","nested":{"key":"value"}}"#;
    let parsed = parse_json_safely(json_str).expect("Failed to parse test JSON safely");

    assert!(parsed.contains_key("key"));
    assert!(parsed.contains_key("nested"));

    let quoted_json_str = r#""{"key":"value","nested":{"key":"value"}}""#;
    let parsed_quoted = parse_json_safely(quoted_json_str).expect("Failed to parse quoted test JSON safely");

    assert!(parsed_quoted.contains_key("key"));
    assert!(parsed_quoted.contains_key("nested"));
}

#[test]
fn test_strip_outer_quotes_edge_cases() {
    assert_eq!(strip_outer_quotes(""), "");
    assert_eq!(strip_outer_quotes("'"), "'");
    assert_eq!(strip_outer_quotes("\""), "\"");
    assert_eq!(strip_outer_quotes("''"), "");
    assert_eq!(strip_outer_quotes("\"\""), "");
    assert_eq!(strip_outer_quotes("'a'"), "a");
}

#[test]
fn test_memory_limits() {
    // 测试输出限制
    let script = r#"
    function main(config) {
      for(let i = 0; i < 2000; i++) {
        console.log("test");
      }
      return config;
    }
  "#;

    #[allow(clippy::expect_used)]
    let config = &serde_yaml_ng::from_str("test: value").expect("Failed to parse test YAML");
    let result = use_script_sync(script.into(), config, &String::from(""));
    // 应该失败或被限制
    assert!(result.is_ok()); // 会被限制但不会 panic
}

#[test]
fn oversized_script_is_rejected_before_engine_initialization() {
    let script = String::from(std::string::String::from(" ").repeat(MAX_SCRIPT_SIZE + 1));
    let result = use_script_sync(script, &Mapping::new(), &String::from(""));
    assert!(result.is_err());
}
