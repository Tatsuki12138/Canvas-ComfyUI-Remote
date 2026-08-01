# Canvas ComfyUI Remote

**简体中文** | [English](README.en.md)

Canvas 是一个用于远程控制个人电脑上 ComfyUI 的安卓客户端。手机通过 Tailscale 私有网络连接电脑端 Canvas Gateway；提示词和生成图片不会发送到 Canvas 托管服务器。

> 本仓库是仅包含安卓 APP 的开源版本，不包含网页生图界面，也不会启用 Tailscale Funnel 公网访问。

## 主要功能

- 使用八位、30 分钟有效的配对码连接安卓手机
- 在手机端启动、停止和重启指定的 ComfyUI
- 选择工作流、底模、采样器和 LoRA 堆进行生图
- 实时查看任务阶段、采样步数和结果传输进度
- 提供本次会话画廊、原图保存和 Gateway 持久收藏接口
- 支持模块化提示词、分组和批量导入
- 通过电脑代理访问 Danbooru，支持自动补全、翻页和原图下载
- 通过兼容的 ComfyUI 自定义节点调用 WD14 反推标签
- 提供受 API Key 保护的可选生图接口，供本地软件集成
- 导出和导入提示词/设置备份，不导出配对令牌

## 工作方式

```text
安卓 APP
    |  Tailscale 加密私网
    v
Tailscale Serve :3001
    |
    v
Canvas Gateway 127.0.0.1:3000
    |
    v
ComfyUI 127.0.0.1:8188
```

## 快速开始

### 普通用户

从最新版发行页面下载：

- `Canvas-Gateway-Setup-v1.1.0.exe`：推荐的 Windows 安装向导
- `Canvas-Android-v1.1.0.apk`：安装到安卓手机
- `Canvas-Gateway-Windows-v1.1.0.zip`：无需安装的绿色便携版
- `SHA256SUMS.txt`：用于校验下载文件完整性

下载入口：

- [Gitee 发行版](https://gitee.com/tatsuki12138/Canvas-ComfyUI-Remote/releases)
- [GitHub Releases](https://github.com/Tatsuki12138/Canvas-ComfyUI-Remote/releases)

电脑端优先运行 `Canvas-Gateway-Setup-v1.1.0.exe`。安装向导会依次选择安装位置、ComfyUI 目录和可选代理，并自动识别秋叶整合包及常见便携包的 Python。它还可以创建桌面快捷方式和可选的开机启动项。

安装器只安装 Canvas Gateway，不会安装或修改 ComfyUI、Tailscale、防火墙和 Tailscale Funnel。升级默认保留 `%APPDATA%\CanvasGateway` 中的提示词、设置、收藏和配对状态；卸载也默认保留这些数据。

如果 Windows 显示“未知发布者”，是因为公开版暂未购买代码签名证书。请从本仓库发行页下载，并使用 `SHA256SUMS.txt` 校验文件。也可以下载 ZIP 绿色版，解压后双击 `First-Run-Setup.cmd`。

### 从源码运行

需要准备：

- Windows 10 或 Windows 11
- Python 3.10～3.12
- 能够正常运行的 ComfyUI
- 电脑和安卓手机均已安装 Tailscale，并登录同一个 Tailnet

在 PowerShell 中运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-gateway.ps1
```

选择包含 ComfyUI `main.py` 的文件夹，然后打开：

```text
Canvas-Control-Center.cmd
```

点击 **Start Canvas**，把控制中心显示的 APP 地址和八位配对码填写到安卓 APP 中。

完整安装、连接和故障排查说明见 [docs/使用说明.md](docs/%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E.md)。

## 编译安卓 APP

安装 Node.js 20+、Android Studio 和 JDK 17，然后运行：

```powershell
cd android-app
npm ci
npm test
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

APK 输出位置：

```text
android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

## 私人数据

运行数据默认保存在仓库之外：

```text
%APPDATA%\CanvasGateway
```

其中包含用户配置、配对状态、缓存结果、收藏和日志。该目录已经被 Git 排除；提交问题报告前，也不要在未检查的情况下上传这些文件。

## 模型与依赖

本仓库不分发 ComfyUI、底模、LoRA、反推模型或第三方自定义节点。工作流模板可能要求用户自行安装对应模型和节点，并遵守各自的许可证。

## 安全说明

Gateway 和 ComfyUI 默认只监听电脑回环地址。远程访问仅通过 Tailscale Serve 提供，本版本不支持 Funnel 或公网网页暴露。v1.1.0 还限制了浏览器跨域来源，并对配对码失败尝试进行限速。修改网络监听配置前请先阅读 [SECURITY.md](SECURITY.md)；本次检查记录见 [v1.1.0 安全与隐私审计](docs/SECURITY_REVIEW_v1.1.0.md)。

## 开源协议

Canvas 自有源代码采用 [MIT License](LICENSE)。第三方依赖、模型和节点仍遵循各自的许可证。
