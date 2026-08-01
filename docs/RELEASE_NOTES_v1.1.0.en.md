# Canvas ComfyUI Remote v1.1.0

[简体中文](RELEASE_NOTES_v1.1.0.md) | **English**

## Assets

- `Canvas-Gateway-Setup-v1.1.0.exe`: recommended bilingual Windows setup wizard.
- `Canvas-Gateway-Windows-v1.1.0.zip`: portable Gateway package.
- `Canvas-Android-v1.1.0.apk`: Android client.
- `SHA256SUMS.txt`: SHA-256 hashes for all three install assets.

## Changes

- Added a Simplified Chinese/English Windows setup wizard.
- Detects Aki, official portable and virtual-environment ComfyUI Python layouts.
- Offers optional desktop and startup shortcuts.
- Preserves existing configuration, prompts, favorites and pairing state during upgrades.
- Preserves personal data during uninstall unless deletion is explicitly confirmed.
- Restricts browser CORS access to Android Capacitor local origins.
- Limits failed eight-digit pairing attempts to eight per rolling minute.
- Adds automated fresh-install, upgrade, uninstall and data-preservation tests.
- Expands setup, privacy and security documentation.

## Installation

New users should run the Setup EXE and select the ComfyUI directory containing `main.py`. Existing portable users can install over their current setup; `%APPDATA%\CanvasGateway` is detected and preserved.

The public installer is not Authenticode-signed and may show an unknown-publisher warning. Download it only from this repository and verify `SHA256SUMS.txt`.
