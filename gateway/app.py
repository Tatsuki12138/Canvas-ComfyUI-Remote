from __future__ import annotations

import asyncio
import json
import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from canvas_gateway.config import DATA_ROOT, PACKAGE_ROOT, load_config
from canvas_gateway.routes import close_danbooru_client, router, set_pairing
from canvas_gateway.runtime import init_runtime

APP_VERSION = "1.1.0-app-only"

# ---- runtime directories and state ----

DATA_DIR = DATA_ROOT
RESULTS_DIR = DATA_DIR / "results"
TAVERN_IMAGES_DIR = DATA_DIR / "tavern-images"
FAVORITES_DIR = DATA_DIR / "favorites"
LOG_DIR = DATA_DIR / "logs"
STATE_PATH = DATA_DIR / "state.json"
PAIRING_PATH = DATA_DIR / "pairing-code.txt"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
TAVERN_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
FAVORITES_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

CONFIG = load_config()
PAIRING_CODE = f"{secrets.randbelow(100_000_000):08d}"
PAIRING_EXPIRES_AT = time.time() + 30 * 60
PAIRING_PATH.write_text(PAIRING_CODE, encoding="utf-8")


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_state() -> None:
    STATE_PATH.write_text(json.dumps(STATE, indent=2), encoding="utf-8")


STATE = load_state()
JOBS: dict[str, dict[str, Any]] = {}

# wire runtime state for cross-module access
init_runtime(
    state=STATE,
    jobs=JOBS,
    save_fn=save_state,
    results_dir=RESULTS_DIR,
    tavern_images_dir=TAVERN_IMAGES_DIR,
    favorites_dir=FAVORITES_DIR,
    log_dir=LOG_DIR,
)
set_pairing(PAIRING_CODE, PAIRING_EXPIRES_AT)


# ---- cleanup loop ----

async def cleanup_loop() -> None:
    while True:
        cutoff = time.time() - float(CONFIG["retention_hours"]) * 3600
        for path in RESULTS_DIR.glob("*"):
            try:
                if path.is_file() and path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
            except OSError:
                pass
        tavern_cutoff = time.time() - float(CONFIG.get("tavern_image_retention_hours", 720)) * 3600
        tavern_images = STATE.setdefault("tavern_images", {})
        if not isinstance(tavern_images, dict):
            tavern_images = {}
            STATE["tavern_images"] = tavern_images
        removed = False
        for image_id, entry in list(tavern_images.items()):
            try:
                path = Path(entry.get("path", ""))
                created_at = float(entry.get("created_at") or path.stat().st_mtime)
                if created_at < tavern_cutoff:
                    path.unlink(missing_ok=True)
                    tavern_images.pop(image_id, None)
                    removed = True
            except OSError:
                tavern_images.pop(image_id, None)
                removed = True
        if removed:
            save_state()
        await asyncio.sleep(15 * 60)


# ---- fastapi app ----

@asynccontextmanager
async def lifespan(_: FastAPI):
    cleanup_task = asyncio.create_task(cleanup_loop())
    print("\nCanvas Gateway started in APP-only mode.")
    print(f"Pairing code (valid for 30 minutes): {PAIRING_CODE}")
    print(f"Pairing code file: {PAIRING_PATH}\n")
    try:
        yield
    finally:
        cleanup_task.cancel()
        await close_danbooru_client()


app = FastAPI(title="Canvas Gateway", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # Capacitor serves the bundled Android UI from https://localhost.  Keep
    # localhost variants for development, but do not let arbitrary websites
    # probe or drive a user's private Gateway from a browser tab.
    allow_origins=["https://localhost", "http://localhost", "capacitor://localhost"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Canvas-API-Key"],
)


@app.middleware("http")
async def privacy_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, private, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


app.include_router(router)


# ---- root / apk download ----

@app.head("/")
async def root_head() -> Response:
    return Response(status_code=200)


@app.get("/")
async def root() -> JSONResponse:
    return JSONResponse(
        {
            "name": "Canvas Gateway",
            "version": APP_VERSION,
            "mode": "app-only",
            "apk_available": (PACKAGE_ROOT / "Canvas.apk").exists(),
        }
    )


@app.get("/Canvas.apk")
async def download_apk() -> FileResponse:
    apk = PACKAGE_ROOT / "Canvas.apk"
    if not apk.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="APK is not bundled in this gateway folder yet.")
    return FileResponse(apk, media_type="application/vnd.android.package-archive", filename="Canvas.apk")


# ---- run ----

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("CANVAS_GATEWAY_PORT", "3000"))
    uvicorn.run(app, host="127.0.0.1", port=port, access_log=False)
