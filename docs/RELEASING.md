# Release process

Release signing material must never be committed to this repository.

## First release only

From PowerShell at the repository root:

```powershell
.\scripts\New-ReleaseSigningKey.ps1
```

This creates the keystore and generated credentials under `%USERPROFILE%\.canvas-release`. Back up that entire directory securely. Every later APK update must use the same key.

## Build a release

```powershell
.\scripts\Build-Release.ps1 -Version 1.0.0
```

The script runs the APP tests, creates a signed APK, packages the Windows Gateway executable and writes SHA256 checksums under `release\v1.0.0`.

Create and push a matching Git tag only after verifying the assets:

```powershell
git tag -a v1.0.0 -m "Canvas ComfyUI Remote v1.0.0"
git push origin v1.0.0
```

Upload the three generated files to the matching GitHub Release. Do not upload the keystore or `signing.properties`.
