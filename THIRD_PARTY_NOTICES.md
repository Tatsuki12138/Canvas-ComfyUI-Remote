# Third-party notices

Canvas uses FastAPI, Uvicorn, HTTPX, Pillow, WebSockets, Capacitor, AndroidX, Vite and their transitive dependencies. Each dependency remains under its own license.

ComfyUI, Tailscale, Danbooru, checkpoints, LoRAs, WD14 tagger models and ComfyUI custom nodes are not part of this repository. Product and project names are used only to describe interoperability. Users are responsible for following the licenses and terms of the components they install.

The included workflow JSON files contain graph configuration only and do not include model weights.

## Optional workflow interoperability

The bundled Anima Base workflow template references `WeiLinPromptUIOnlyLoraStack` (displayed as WeiLin LoRA Stack), provided by the independent [WeiLin-Comfyui-Tools](https://github.com/weilin9999/WeiLin-Comfyui-Tools) project. That project is licensed under GPL-2.0. Its source code is not included in Canvas release packages; users who install it must follow the upstream project's installation guidance and license.
