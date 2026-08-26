use rust_i18n::i18n;
use std::borrow::Cow;

const DEFAULT_LANGUAGE: &str = "zh";
i18n!("locales", fallback = "zh");

#[inline]
fn resolve_supported_language(language: &str) -> Option<Cow<'static, str>> {
    let normalized = language.to_lowercase().replace('_', "-");
    if normalized == "zh" || normalized.starts_with("zh-") {
        Some(Cow::Borrowed("zh"))
    } else if normalized == "en" || normalized.starts_with("en-") {
        Some(Cow::Borrowed("en"))
    } else {
        None
    }
}

#[inline]
pub fn current_language(language: Option<&str>) -> Cow<'static, str> {
    language
        .filter(|lang| !lang.is_empty())
        .and_then(resolve_supported_language)
        .unwrap_or_else(system_language)
}

#[inline]
pub fn system_language() -> Cow<'static, str> {
    sys_locale::get_locale()
        .as_deref()
        .and_then(resolve_supported_language)
        .unwrap_or(Cow::Borrowed(DEFAULT_LANGUAGE))
}

#[inline]
pub fn sync_locale(language: Option<&str>) {
    rust_i18n::set_locale(&current_language(language));
}

#[inline]
pub fn set_locale(language: &str) {
    let lang = resolve_supported_language(language).unwrap_or(Cow::Borrowed(DEFAULT_LANGUAGE));
    rust_i18n::set_locale(&lang);
}

#[inline]
pub fn translate(key: &str) -> Cow<'_, str> {
    rust_i18n::t!(key)
}

#[macro_export]
macro_rules! t {
    ($key:expr) => {
        $crate::translate(&$key)
    };
    ($key:expr, $($arg_name:ident = $arg_value:expr),*) => {
        {
            let mut _text = $crate::translate(&$key).into_owned();
            $(
                _text = _text.replace(&format!("{{{}}}", stringify!($arg_name)), &$arg_value);
            )*
            ::std::borrow::Cow::<'static, str>::Owned(_text)
        }
    };
}
