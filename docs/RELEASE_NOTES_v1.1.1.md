# Canvas ComfyUI Remote v1.1.1

[简体中文](RELEASE_NOTES_v1.1.1.md) | [English](RELEASE_NOTES_v1.1.1.en.md)

## 修订内容

- 移除 Android APP 中预置的角色提示词及提示词分组；全新安装的所有提示词模块均为空；
- 保留提示词模块、分组、批量导入及本地持久化能力；
- 覆盖升级不会删除用户自行保存的提示词或其他个人数据；
- 重新编写 Windows 安装向导的中英文说明，统一采用正式、明确的书面表述；
- 重新执行安装、升级、卸载、依赖、密钥、隐私及恶意软件扫描。

## 下载文件

- `Canvas-Gateway-Setup-v1.1.1.exe`：Windows 安装程序；
- `Canvas-Gateway-Windows-v1.1.1.zip`：Windows 便携包；
- `Canvas-Android-v1.1.1.apk`：Android 客户端；
- `Canvas-Custom-Workflow-Guide.zh-CN.md`：自定义工作流封装、参数映射和 AI 辅助编写规范；
- `WeiLin-Comfyui-Tools-v0.0.79-efd9237-GPL-2.0.zip`：Anima Base 动态 LoRA 堆所需的可选第三方节点源码快照；
- `SHA256SUMS-v1.1.1.txt`：推荐使用的版本化发布文件 SHA-256 校验表；
- `SHA256SUMS.txt`：内容相同的兼容文件名。

## 可选第三方节点说明

`WeiLin-Comfyui-Tools-v0.0.79-efd9237-GPL-2.0.zip` 来自独立项目 [WeiLin-Comfyui-Tools](https://github.com/weilin9999/WeiLin-Comfyui-Tools)，固定到上游 `v0.0.79 / efd9237`，采用 GPL-2.0 许可证。压缩包保留完整源码和许可证，不属于 Canvas 的 MIT 代码，也没有被嵌入 Windows 安装程序、便携包或 Android APK。

需要使用 Anima Base 动态 LoRA 堆的用户可以将其中的 `weilin-comfyui-tools` 目录放入 `ComfyUI\custom_nodes\`，使用 ComfyUI 自己的 Python 安装 `requirements.txt`，然后重启 ComfyUI。完整步骤见仓库中的中文使用说明。
