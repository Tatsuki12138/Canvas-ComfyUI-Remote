# Security policy

## Supported scope

The supported deployment is a single-user Windows PC with Gateway and ComfyUI bound to loopback, accessed from an Android device through the same Tailscale tailnet.

The project intentionally does not provide a public web UI or Tailscale Funnel configuration.

## Security properties

- Pairing codes expire after 30 minutes.
- APP bearer tokens are stored as SHA-256 hashes by the Gateway.
- Result-image access uses job-scoped random tokens.
- Gateway listens on `127.0.0.1:3000`.
- ComfyUI is configured to listen on `127.0.0.1:8188`.
- Tailscale Serve is the only supported remote entry.
- Prompt/settings backups exclude bearer tokens and external API keys.

## Operator responsibilities

- Protect the Windows account and Tailnet membership.
- Do not forward ports 3000, 3001 or 8188 on a router.
- Do not publish the Tailnet URL together with credentials.
- Rotate the external generation API key if it may have leaked.
- Review `%APPDATA%\CanvasGateway` before sharing logs or diagnostics.
- Keep ComfyUI and custom nodes updated from trusted sources.

This is not a hardened multi-user service. Anyone who controls the Windows account or an authorized Tailnet device may be able to reach the Gateway.

## Reporting a vulnerability

Please use a private GitHub security advisory instead of opening a public issue containing exploit details, tokens, private URLs or generated content.
