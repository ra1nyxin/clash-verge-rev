<h1 align="center">
  <img src="./src-tauri/icons/icon.png" alt="Clash Verge Rev" width="128" />
  <br>
  Clash Verge Rev
</h1>

<p align="center">基于 Tauri 2 和 mihomo 的跨平台代理客户端。</p>

## 界面预览

| 深色模式                          | 浅色模式                           |
| --------------------------------- | ---------------------------------- |
| ![深色模式](./docs/preview_dark.png) | ![浅色模式](./docs/preview_light.png) |

## 下载与安装

请从本仓库的 [Releases](https://github.com/ra1nyxin/clash-verge-rev/releases) 下载对应安装包。

支持以下平台：

- Windows x64、x86 和 ARM64
- Linux x64、ARM64 和 ARMv7
- macOS 11 及以上版本（Intel 和 Apple 芯片）

发布类型：

| 类型      | 说明                               |
| --------- | ---------------------------------- |
| Stable    | 正式版本，适合日常使用             |
| AutoBuild | 滚动构建版本，可能包含尚未稳定的改动 |

安装说明与常见问题可查阅[上游项目文档](https://clash-verge-rev.github.io/)。

## 功能

- 基于 Rust 和 Tauri 2
- 内置 [mihomo](https://github.com/MetaCubeX/mihomo) 内核，支持切换 Alpha 内核
- 支持系统代理、守卫和 TUN 模式
- 支持配置文件管理、Merge、Script 与语法提示
- 支持代理组、规则、托盘图标、主题颜色和 CSS 自定义
- 支持 WebDAV 配置备份与同步

## 本地开发

安装 [Tauri 所需的系统依赖](https://tauri.app/start/prerequisites/) 后执行：

```shell
corepack enable
pnpm install
pnpm run prebuild
pnpm dev
```

常用命令：

```shell
pnpm lint
pnpm test
pnpm build
```

`pnpm dev` 会保留开发通道原有的服务状态。使用 `pnpm dev:service` 可安装或更新隔离的开发服务，使用 `pnpm dev:sidecar` 可强制以无特权 Sidecar 模式启动。

## 项目来源

本项目延续自 [Clash Verge](https://github.com/zzzgydi/clash-verge)，主要使用 [Tauri](https://github.com/tauri-apps/tauri)、[mihomo](https://github.com/MetaCubeX/mihomo) 和 [Vite](https://github.com/vitejs/vite)。

## 许可证

本项目采用 [GPL-3.0](./LICENSE) 许可证。
