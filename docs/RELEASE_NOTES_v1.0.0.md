# Canvas ComfyUI Remote v1.0.0

首个公开发布的 Canvas ComfyUI Remote 安卓 APP 版本。

## 下载文件

- `Canvas-Android-v1.0.0.apk`：安装到安卓手机。
- `Canvas-Gateway-Windows-v1.0.0.zip`：解压到运行 ComfyUI 的 Windows 电脑。
- `SHA256SUMS.txt`：用于校验以上两个下载文件的完整性。

## 快速开始

1. 在 Windows 电脑和安卓手机上安装 Tailscale，并登录同一个 Tailnet。
2. 解压 Windows Gateway ZIP。
3. 运行 `First-Run-Setup.cmd`，选择包含 `main.py` 的 ComfyUI 文件夹。
4. 打开 `Canvas-Control-Center.cmd`，点击 **Start Canvas**。
5. 安装并打开 APK，填写控制中心显示的 APP 地址和八位配对码。

发布包不包含 ComfyUI、底模、LoRA 或第三方自定义节点。安装和故障排查见 [使用说明](使用说明.md)。
