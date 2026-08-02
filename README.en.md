# Canvas ComfyUI Remote

[简体中文](README.md) | **English**

Canvas is an Android front end for running ComfyUI on your own Windows PC. The phone talks to a small local Gateway through a private Tailscale network; prompts and generated images are not sent to a hosted Canvas service.

> This repository is the APP-only edition. It does not include a browser UI or Tailscale Funnel support.

## Features

- Pair an Android phone with an eight-digit, 30-minute code
- Start, stop and restart the configured ComfyUI instance
- Generate with selectable workflows, base models, samplers and LoRA stacks
- Follow job stage, sampler steps and result delivery progress
- Session gallery, original-image saving and persistent favorites support in the Gateway API
- Modular prompt presets, groups and batch import
- Danbooru search, autocomplete, paging and original-image download through the PC proxy
- WD14 interrogation through a compatible ComfyUI custom node
- Optional API-key-protected generation endpoint for local integrations
- Export and import prompt/settings backups without exporting pairing tokens

## Architecture

```text
Android APP
    |  encrypted Tailnet connection
    v
Tailscale Serve :3001
    |
    v
Canvas Gateway 127.0.0.1:3000
    |
    v
ComfyUI 127.0.0.1:8188
```

## Quick start

### For normal users

Download these files from the latest GitHub or Gitee release:

- `Canvas-Gateway-Setup-v1.1.1.exe`: recommended Windows setup wizard
- `Canvas-Android-v1.1.1.apk`: Android client
- `Canvas-Gateway-Windows-v1.1.1.zip`: portable alternative
- `Canvas-Custom-Workflow-Guide.zh-CN.md`: detailed custom-workflow guide in Chinese
- `WeiLin-Comfyui-Tools-v0.0.79-efd9237-GPL-2.0.zip`: optional third-party source snapshot for the Anima LoRA stack
- `SHA256SUMS-v1.1.1.txt`: recommended versioned SHA-256 checksum list
- `SHA256SUMS.txt`: compatibility alias with the same contents

The setup wizard selects the install location and ComfyUI folder, detects common bundled Python layouts, and offers desktop/startup shortcuts. It does not install or change ComfyUI, Tailscale, Windows Firewall, or Tailscale Funnel. Upgrades and uninstalls preserve `%APPDATA%\CanvasGateway` by default.

The public installer is not Authenticode-signed, so Windows may show an unknown-publisher warning. Download it only from this repository and verify `SHA256SUMS.txt`. ZIP users should extract the package and run `First-Run-Setup.cmd`.

### From source

Requirements:

- Windows 10 or 11
- Python 3.10-3.12
- A working ComfyUI installation
- Tailscale installed and signed in on both the PC and Android phone

From PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-gateway.ps1
```

Select the folder containing ComfyUI's `main.py`, then open:

```text
Canvas-Control-Center.cmd
```

Press **Start Canvas**, copy the APP URL and pairing code, install/open the Android APP, and enter both values.

The complete Chinese guide is in [docs/使用说明.md](docs/%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E.md).

Release maintainers should follow [docs/RELEASING.md](docs/RELEASING.md). Never commit Android signing files.

## Build the Android APP

Install Node.js 20+ and Android Studio/JDK 17, then run:

```powershell
cd android-app
npm ci
npm test
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

The APK will be written to `android-app/android/app/build/outputs/apk/debug/app-debug.apk`.

## Private data

Runtime data is stored outside the repository at:

```text
%APPDATA%\CanvasGateway
```

This directory contains the user's configuration, pairing state, cached results, favorites and logs. It is excluded from Git and must not be included in bug reports without review.

## Models and dependencies

The Canvas installer and portable packages do not bundle ComfyUI, checkpoints, LoRAs, tagger models or third-party custom nodes. Workflow templates may require the user to install compatible models and nodes separately under their own licenses.

A release page may provide a separately labeled third-party source snapshot for users who cannot directly access an upstream repository. Such an asset is not Canvas MIT code and retains its original license and source attribution. The Anima Base dynamic LoRA stack references `WeiLinPromptUIOnlyLoraStack`; the optional snapshot is licensed under GPL-2.0 and originates from [WeiLin-Comfyui-Tools](https://github.com/weilin9999/WeiLin-Comfyui-Tools).

## Security

Gateway and ComfyUI bind to loopback by default. Remote access is provided only through Tailscale Serve, and Funnel/public web exposure is intentionally unsupported. Gateway also restricts browser CORS origins and rate-limits failed pairing attempts. Read [SECURITY.md](SECURITY.md) before changing network bindings and see the [v1.1.1 security review](docs/SECURITY_REVIEW_v1.1.1.md).

## License

Canvas source code is available under the [MIT License](LICENSE). Third-party dependencies and referenced models retain their own licenses.
