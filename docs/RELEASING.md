# Release process

Release signing material must never be committed to this repository.

## First release only

From PowerShell at the repository root:

```powershell
.\scripts\New-ReleaseSigningKey.ps1
```

This creates the keystore and generated credentials under `%USERPROFILE%\.canvas-release`. Back up that entire directory securely. Every later APK update must use the same key.

## Build a release

Install Inno Setup 7 from the official site before building. The bilingual installer uses the official Simplified Chinese language file included with Inno Setup 7.

```powershell
.\scripts\Build-Release.ps1 -Version 1.1.1
```

The script runs the APP tests, creates a signed APK, packages the portable Windows Gateway, builds the bilingual setup wizard, verifies install/upgrade/uninstall data preservation, and writes SHA256 checksums under `release\v1.1.1`.

Create and push a matching Git tag only after verifying the assets:

```powershell
git tag -a v1.1.1 -m "Canvas ComfyUI Remote v1.1.1"
git push origin v1.1.1
```

Upload the APK, portable ZIP, setup EXE and `SHA256SUMS.txt` to the matching GitHub and Gitee releases. Do not upload the keystore or `signing.properties`.
