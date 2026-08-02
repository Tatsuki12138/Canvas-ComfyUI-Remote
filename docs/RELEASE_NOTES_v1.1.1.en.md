# Canvas ComfyUI Remote v1.1.1

[简体中文](RELEASE_NOTES_v1.1.1.md) | [English](RELEASE_NOTES_v1.1.1.en.md)

## Changes

- Removed bundled character prompts and prompt groups from the Android APP; every prompt module is empty on a fresh installation.
- Preserved prompt modules, grouping, batch import and local persistence capabilities.
- Upgrading does not delete prompts or other personal data saved by the user.
- Rewrote the Windows setup wizard's Chinese and English notices in formal, explicit language.
- Repeated installation, upgrade, uninstall, dependency, secret, privacy and malware checks.

## Downloads

- `Canvas-Gateway-Setup-v1.1.1.exe`: Windows setup program.
- `Canvas-Gateway-Windows-v1.1.1.zip`: portable Windows package.
- `Canvas-Android-v1.1.1.apk`: Android client.
- `Canvas-Custom-Workflow-Guide.zh-CN.md`: detailed custom-workflow packaging and AI mapping guide in Chinese.
- `WeiLin-Comfyui-Tools-v0.0.79-efd9237-GPL-2.0.zip`: optional third-party source snapshot required by the Anima Base dynamic LoRA stack.
- `SHA256SUMS.txt`: SHA-256 checksums for the release files.

## Optional third-party node

`WeiLin-Comfyui-Tools-v0.0.79-efd9237-GPL-2.0.zip` is an independently distributed source snapshot of [WeiLin-Comfyui-Tools](https://github.com/weilin9999/WeiLin-Comfyui-Tools), pinned to upstream `v0.0.79 / efd9237` and licensed under GPL-2.0. It retains the upstream source and license, is not Canvas MIT code, and is not embedded in the Windows installer, portable Gateway package or Android APK.

Users who need the Anima Base dynamic LoRA stack can place the contained `weilin-comfyui-tools` directory under `ComfyUI/custom_nodes`, install its `requirements.txt` with the Python environment used by that ComfyUI installation, and then restart ComfyUI.
