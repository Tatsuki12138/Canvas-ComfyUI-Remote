# Canvas ComfyUI Remote v1.0.0

First public APP-only release of Canvas ComfyUI Remote.

## Downloads

- `Canvas-Android-v1.0.0.apk`: install this on the Android phone.
- `Canvas-Gateway-Windows-v1.0.0.zip`: extract this on the Windows PC running ComfyUI.
- `SHA256SUMS.txt`: optional integrity checks for both downloads.

## Quick start

1. Install Tailscale on the Windows PC and Android phone, then sign in to the same Tailnet.
2. Extract the Windows Gateway ZIP.
3. Run `First-Run-Setup.cmd` and select the ComfyUI folder containing `main.py`.
4. Open `Canvas-Control-Center.cmd` and press **Start Canvas**.
5. Install/open the APK and enter the APP URL and eight-digit pairing code shown by the control center.

The release package does not include ComfyUI, checkpoints, LoRAs or custom nodes. See `docs/使用说明.md` for troubleshooting and advanced configuration.
