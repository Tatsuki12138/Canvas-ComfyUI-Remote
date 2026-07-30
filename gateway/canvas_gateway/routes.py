from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import mimetypes
import os
import secrets
import time
import uuid
from collections import OrderedDict
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse
from urllib.request import getproxies

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from fastapi.responses import FileResponse, JSONResponse

from .comfy_bridge import (
    build_workflow,
    comfy_available,
    comfy_system_stats,
    comfy_starting_state,
    mark_comfy_ready,
    monitor_job,
    parse_default_base_model_from_workflow,
    parse_lora_stack_from_workflow,
    pid_listening_on_port,
    scan_checkpoints,
    scan_loras,
    start_comfy,
    stop_comfy,
    track_progress,
    workflow_definitions,
    workflow_definition,
    workflow_path,
)
from .config import CONFIG
from .models import (
    ExternalGenerateRequest,
    FavoriteCreateRequest,
    GenerateRequest,
    PairRequest,
    TagInterrogateRequest,
    TagNormalizeRequest,
)
from .runtime import favorites_dir, get_jobs, get_state, log_dir, results_dir, save_state, tavern_images_dir

router = APIRouter()
APP_VERSION = "0.5.2.1-app-only"

# pairing state — set from app.py before serving
_pairing_code: str = ""
_pairing_expires_at: float = 0.0
_danbooru_client: httpx.AsyncClient | None = None
_danbooru_client_lock = asyncio.Lock()
_danbooru_search_cache: dict[tuple[str, int, int], tuple[float, dict[str, Any]]] = {}
_danbooru_autocomplete_cache: dict[tuple[str, int], tuple[float, dict[str, Any]]] = {}
_danbooru_image_cache: OrderedDict[str, tuple[float, bytes, str]] = OrderedDict()
_danbooru_image_cache_bytes = 0
_DANBOORU_IMAGE_CACHE_MAX_BYTES = 32 * 1024 * 1024
_DANBOORU_IMAGE_CACHE_MAX_ITEMS = 160
_WD14_MAX_IMAGE_BYTES = 16 * 1024 * 1024
_WD14_UPLOAD_SUBFOLDER = "CanvasTemp/wd14"
_wd14_required_inputs_cache: set[str] | None = None


def _sampler_nodes(workflow_def: dict[str, Any]) -> list[str]:
    node_map = workflow_def.get("node_map") or {}
    nodes: list[str] = []
    for key in ("steps", "hires_steps"):
        mapping = node_map.get(key) or {}
        node = str(mapping.get("node") or "")
        if node and node not in nodes:
            nodes.append(node)
    return nodes


def set_pairing(code: str, expires_at: float) -> None:
    global _pairing_code, _pairing_expires_at
    _pairing_code = code
    _pairing_expires_at = expires_at


# ---- helpers ----

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _valid_bearer_token(authorization: str | None) -> bool:
    if not authorization or not authorization.startswith("Bearer "):
        return False
    supplied_hash = _token_hash(authorization[7:])
    expected = get_state().get("token_hash")
    return bool(expected and secrets.compare_digest(supplied_hash, expected))


async def require_token(authorization: str | None = Header(default=None)) -> None:
    if not _valid_bearer_token(authorization):
        raise HTTPException(status_code=401, detail="需要配对")


def _comfy_port() -> int:
    parsed = urlparse(CONFIG["comfy_url"])
    return parsed.port or (443 if parsed.scheme == "https" else 80)


def _result_media_type(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "image/png"


# ---- public routes ----

@router.get("/api/health")
async def health() -> dict[str, Any]:
    stats = await comfy_system_stats()
    starting = False if stats is not None else comfy_starting_state()
    return {
        "gateway": True,
        "comfy": stats is not None,
        "comfy_starting": starting,
        "paired": bool(get_state().get("token_hash")),
        "workflow": workflow_path(workflow_definition()).exists(),
        "workflows": all(workflow_path(item).exists() for item in workflow_definitions()),
        "comfy_pid": pid_listening_on_port(_comfy_port()) if stats is not None else None,
        "proxy": bool(_detected_proxy_url()),
    }


@router.post("/api/pair")
async def pair(payload: PairRequest) -> dict[str, str]:
    if time.time() > _pairing_expires_at:
        raise HTTPException(status_code=410, detail="配对码已过期，请重启网关")
    if not secrets.compare_digest(payload.code, _pairing_code):
        raise HTTPException(status_code=403, detail="配对码错误")
    token = secrets.token_urlsafe(48)
    get_state()["token_hash"] = _token_hash(token)
    get_state()["paired_at"] = time.time()
    save_state()
    return {"token": token}


# ---- config / list routes ----

@router.get("/api/config", dependencies=[Depends(require_token)])
async def public_config() -> dict[str, Any]:
    workflows = workflow_definitions()
    return {
        "name": "Canvas",
        "version": APP_VERSION,
        "retention_hours": CONFIG["retention_hours"],
        "tavern_image_retention_hours": CONFIG.get("tavern_image_retention_hours", 720),
        "defaults": {"width": 1024, "height": 1024, "steps": 28, "cfg": 6.0, "seed": -1},
        "presets": [
            {"label": "Portrait", "width": 768, "height": 1024},
            {"label": "Square", "width": 1024, "height": 1024},
            {"label": "Landscape", "width": 1024, "height": 768},
        ],
        "default_workflow": CONFIG.get("default_workflow") or workflows[0].get("id"),
        "workflows": [
            {
                "id": item.get("id"),
                "label": item.get("label") or item.get("id"),
                "features": item.get("features", []),
                "defaults": item.get("defaults", {}),
                "model_kind": item.get("model_kind", "checkpoint"),
                "available": workflow_path(item).exists(),
                "default_checkpoint": parse_default_base_model_from_workflow(item.get("id")),
            }
            for item in workflows
        ],
        "default_loras": parse_lora_stack_from_workflow(),
        "default_checkpoint": parse_default_base_model_from_workflow(),
        "proxy_detected": bool(_detected_proxy_url()),
    }


@router.get("/api/workflows", dependencies=[Depends(require_token)])
async def workflow_list() -> dict[str, Any]:
    workflows = workflow_definitions()
    return {
        "default": CONFIG.get("default_workflow") or workflows[0].get("id"),
        "items": [
            {
                "id": item.get("id"),
                "label": item.get("label") or item.get("id"),
                "features": item.get("features", []),
                "defaults": item.get("defaults", {}),
                "model_kind": item.get("model_kind", "checkpoint"),
                "available": workflow_path(item).exists(),
                "default_checkpoint": parse_default_base_model_from_workflow(item.get("id")),
            }
            for item in workflows
        ],
    }


@router.get("/api/loras", dependencies=[Depends(require_token)])
async def lora_list() -> dict[str, Any]:
    loras = scan_loras()
    return {"items": loras, "count": len(loras)}


@router.get("/api/checkpoints", dependencies=[Depends(require_token)])
async def checkpoint_list(workflow: str | None = Query(default=None, max_length=80)) -> dict[str, Any]:
    workflow_def = workflow_definition(workflow)
    checkpoints = scan_checkpoints(workflow_def.get("id"))
    return {
        "items": checkpoints,
        "count": len(checkpoints),
        "workflow_id": workflow_def.get("id"),
        "model_kind": workflow_def.get("model_kind", "checkpoint"),
        "default": parse_default_base_model_from_workflow(workflow_def.get("id")),
    }


# ---- generation ----

@router.post("/api/generate", dependencies=[Depends(require_token)])
async def generate(payload: GenerateRequest) -> JSONResponse:
    if not await comfy_available():
        raise HTTPException(status_code=503, detail="ComfyUI 尚未启动")
    job_id = uuid.uuid4().hex
    client_id = f"canvas-{job_id}"
    workflow_def = workflow_definition(payload.workflow_id)
    try:
        workflow = build_workflow(payload, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    jobs = get_jobs()
    jobs[job_id] = {
        "id": job_id,
        "prompt_id": "",
        "status": "submitting",
        "stage": "Connecting to ComfyUI",
        "progress": 0,
        "created_at": time.time(),
        "checkpoint": payload.checkpoint,
        "workflow_id": workflow_def.get("id"),
        "workflow_label": workflow_def.get("label"),
        "prompt": payload.prompt,
        "negative_prompt": payload.negative_prompt,
        "width": payload.width,
        "height": payload.height,
        "steps": payload.steps,
        "cfg": payload.cfg,
        "sampler_name": payload.sampler_name,
        "scheduler": payload.scheduler,
        "hires_steps": payload.hires_steps,
        "hires_cfg": payload.hires_cfg,
        "hires_denoise": payload.hires_denoise,
        "hires_sampler_name": payload.hires_sampler_name,
        "hires_scheduler": payload.hires_scheduler,
        "seed": payload.seed,
        "loras": [item.model_dump() for item in (payload.loras or [])],
        "image_token": secrets.token_urlsafe(24),
        "sampler_nodes": _sampler_nodes(workflow_def),
    }
    progress_task = asyncio.create_task(track_progress(job_id, "", client_id, jobs))
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{CONFIG['comfy_url']}/prompt",
                json={"prompt": workflow, "client_id": client_id},
            )
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPStatusError as exc:
        progress_task.cancel()
        jobs.pop(job_id, None)
        detail = exc.response.text[:1000]
        raise HTTPException(status_code=502, detail=f"ComfyUI 拒绝工作流: {detail}") from exc
    except httpx.HTTPError as exc:
        progress_task.cancel()
        jobs.pop(job_id, None)
        raise HTTPException(status_code=502, detail=f"Cannot submit workflow to ComfyUI: {exc}") from exc
    prompt_id = body["prompt_id"]
    jobs[job_id].update({
        "prompt_id": prompt_id,
        "status": "queued",
        "stage": "Queued",
        "progress": max(0, int(jobs[job_id].get("progress") or 0)),
        "submitted_at": time.time(),
    })
    asyncio.create_task(monitor_job(job_id, prompt_id, client_id, jobs, results_dir(), progress_task))
    return JSONResponse({"job_id": job_id, "status": "queued"}, status_code=202)


@router.get("/api/jobs/{job_id}", dependencies=[Depends(require_token)])
async def job_status(job_id: str) -> dict[str, Any]:
    job = get_jobs().get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在或网关已重启")
    public = {key: value for key, value in job.items() if key not in {"result", "results", "prompt_id"}}
    if job.get("status") == "complete":
        public["images"] = [
            {key: value for key, value in item.items() if key not in {"path", "display_path"}}
            for item in job.get("results", [])
        ]
    return public


@router.get("/api/jobs/{job_id}/images", dependencies=[Depends(require_token)])
async def job_images(job_id: str) -> dict[str, Any]:
    job = get_jobs().get(job_id)
    if not job or job.get("status") != "complete":
        raise HTTPException(status_code=404, detail="图片尚未生成")
    return {
        "image_token": job.get("image_token", ""),
        "items": [
            {key: value for key, value in item.items() if key not in {"path", "display_path"}}
            for item in job.get("results", [])
        ],
    }


def _get_job_for_image(job_id: str, access: str, authorization: str | None) -> dict[str, Any]:
    job = get_jobs().get(job_id)
    if not job or job.get("status") != "complete":
        raise HTTPException(status_code=404, detail="图片尚未生成")
    token_ok = access and secrets.compare_digest(access, str(job.get("image_token", "")))
    if not token_ok and not _valid_bearer_token(authorization):
        raise HTTPException(status_code=401, detail="需要配对")
    return job


@router.get("/api/jobs/{job_id}/image")
async def job_image(
    job_id: str,
    variant: str = Query(default="display", pattern="^(display|original)$"),
    access: str = Query(default="", max_length=128),
    authorization: str | None = Header(default=None),
) -> FileResponse:
    return await _serve_job_image(job_id, 0, variant, access, authorization)


@router.get("/api/jobs/{job_id}/image/{index}")
async def job_image_index(
    job_id: str,
    index: int,
    variant: str = Query(default="display", pattern="^(display|original)$"),
    access: str = Query(default="", max_length=128),
    authorization: str | None = Header(default=None),
) -> FileResponse:
    return await _serve_job_image(job_id, index, variant, access, authorization)


async def _serve_job_image(job_id: str, index: int, variant: str, access: str, authorization: str | None) -> FileResponse:
    job = _get_job_for_image(job_id, access, authorization)
    results = job.get("results", [])
    if index < 0 or index >= len(results):
        raise HTTPException(status_code=404, detail="图片索引不存在")
    item = results[index]
    if variant == "display":
        path = Path(item.get("display_path") or item["path"])
        media_type = item.get("display_media_type") or _result_media_type(path)
        filename = f"canvas-{job_id}-{index}-display{path.suffix or '.webp'}"
        content_disposition_type = "inline"
        headers = {"Cache-Control": "private, max-age=300"}
    else:
        path = Path(item["path"])
        media_type = item.get("media_type") or _result_media_type(path)
        filename = f"canvas-{job_id}-{index}{path.suffix or '.png'}"
        content_disposition_type = "attachment"
        headers = {"Cache-Control": "private, no-store"}
    if not path.exists():
        raise HTTPException(status_code=410, detail="图片已按保留策略删除")
    return FileResponse(
        path,
        media_type=media_type,
        filename=filename,
        headers=headers,
        content_disposition_type=content_disposition_type,
    )


@router.delete("/api/jobs/{job_id}", dependencies=[Depends(require_token)])
async def delete_job(job_id: str) -> Response:
    job = get_jobs().pop(job_id, None)
    if job:
        for item in job.get("results", []):
            if item.get("path"):
                Path(item["path"]).unlink(missing_ok=True)
            if item.get("display_path") and item.get("display_path") != item.get("path"):
                Path(item["display_path"]).unlink(missing_ok=True)
        if job.get("result"):
            Path(job["result"]).unlink(missing_ok=True)
    return Response(status_code=204)


# ---- persistent favorites ----

def _favorites_state() -> dict[str, Any]:
    state = get_state()
    favorites = state.setdefault("favorites", {})
    if not isinstance(favorites, dict):
        favorites = {}
        state["favorites"] = favorites
    return favorites


def _public_favorite(entry: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in entry.items() if key not in {"path", "display_path"}}


def _favorite_entry_or_404(favorite_id: str) -> dict[str, Any]:
    entry = _favorites_state().get(favorite_id)
    if not isinstance(entry, dict):
        raise HTTPException(status_code=404, detail="Favorite image not found")
    return entry


def _copy_favorite_file(source: Path, destination: Path) -> None:
    import shutil
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


@router.get("/api/favorites", dependencies=[Depends(require_token)])
async def favorite_list() -> dict[str, Any]:
    favorites = _favorites_state()
    items = sorted(
        [_public_favorite(entry) for entry in favorites.values() if isinstance(entry, dict)],
        key=lambda item: float(item.get("created_at") or 0),
        reverse=True,
    )
    return {"items": items, "count": len(items)}


@router.post("/api/favorites", dependencies=[Depends(require_token)])
async def favorite_create(payload: FavoriteCreateRequest) -> dict[str, Any]:
    job = get_jobs().get(payload.job_id)
    if not job or job.get("status") != "complete":
        raise HTTPException(status_code=404, detail="Generated image is not available")
    results = job.get("results", [])
    if payload.index < 0 or payload.index >= len(results):
        raise HTTPException(status_code=404, detail="Image index not found")
    result = results[payload.index]
    source = Path(result.get("path", ""))
    display_source = Path(result.get("display_path") or result.get("path", ""))
    if not source.exists():
        raise HTTPException(status_code=410, detail="Original image has already been cleaned")

    favorite_id = uuid.uuid4().hex
    original_suffix = source.suffix or ".png"
    display_suffix = display_source.suffix if display_source.exists() else original_suffix
    original_path = favorites_dir() / f"{favorite_id}{original_suffix}"
    display_path = favorites_dir() / f"{favorite_id}-display{display_suffix}"
    await asyncio.to_thread(_copy_favorite_file, source, original_path)
    if display_source.exists():
        await asyncio.to_thread(_copy_favorite_file, display_source, display_path)
    else:
        await asyncio.to_thread(_copy_favorite_file, source, display_path)

    entry = {
        "id": favorite_id,
        "job_id": payload.job_id,
        "index": payload.index,
        "created_at": time.time(),
        "filename": result.get("filename") or f"canvas-{favorite_id}{original_suffix}",
        "path": str(original_path),
        "display_path": str(display_path),
        "media_type": result.get("media_type") or _result_media_type(original_path),
        "display_media_type": result.get("display_media_type") or _result_media_type(display_path),
        "size_bytes": original_path.stat().st_size,
        "display_size_bytes": display_path.stat().st_size,
        "image_token": secrets.token_urlsafe(24),
        "workflow_id": job.get("workflow_id"),
        "workflow_label": job.get("workflow_label"),
        "checkpoint": job.get("checkpoint"),
        "generation_seconds": job.get("generation_seconds"),
        "gateway_prepare_seconds": job.get("gateway_prepare_seconds"),
        "prompt": job.get("prompt", ""),
        "negative_prompt": job.get("negative_prompt", ""),
    }
    _favorites_state()[favorite_id] = entry
    save_state()
    return {"item": _public_favorite(entry)}


@router.get("/api/favorites/{favorite_id}/image")
async def favorite_image(
    favorite_id: str,
    variant: str = Query(default="display", pattern="^(display|original)$"),
    access: str = Query(default="", max_length=128),
    authorization: str | None = Header(default=None),
) -> FileResponse:
    entry = _favorite_entry_or_404(favorite_id)
    token_ok = access and secrets.compare_digest(access, str(entry.get("image_token", "")))
    if not token_ok and not _valid_bearer_token(authorization):
        raise HTTPException(status_code=401, detail="Authentication required")
    if variant == "display":
        path = Path(entry.get("display_path") or entry.get("path", ""))
        media_type = entry.get("display_media_type") or _result_media_type(path)
        filename = f"canvas-favorite-{favorite_id}-display{path.suffix or '.webp'}"
    else:
        path = Path(entry.get("path", ""))
        media_type = entry.get("media_type") or _result_media_type(path)
        filename = entry.get("filename") or f"canvas-favorite-{favorite_id}{path.suffix or '.png'}"
    if not path.exists():
        raise HTTPException(status_code=410, detail="Favorite file is missing")
    return FileResponse(path, media_type=media_type, filename=filename)


@router.delete("/api/favorites/{favorite_id}", dependencies=[Depends(require_token)])
async def favorite_delete(favorite_id: str) -> Response:
    entry = _favorites_state().pop(favorite_id, None)
    if isinstance(entry, dict):
        for key in ("path", "display_path"):
            value = entry.get(key)
            if value:
                Path(value).unlink(missing_ok=True)
        save_state()
    return Response(status_code=204)


# ---- ComfyUI control ----

@router.get("/api/comfy/status", dependencies=[Depends(require_token)])
async def comfy_status() -> dict[str, Any]:
    stats = await comfy_system_stats()
    if stats is not None:
        pid = pid_listening_on_port(_comfy_port())
        mark_comfy_ready(pid)
        return {"running": True, "starting": False, "pid": pid, "stats": stats}
    starting = comfy_starting_state()
    return {
        "running": False,
        "starting": starting,
        "pid": get_state().get("comfy_pid") if starting else None,
        "stats": stats,
    }


@router.post("/api/comfy/start", dependencies=[Depends(require_token)])
async def api_comfy_start() -> dict[str, Any]:
    try:
        return await start_comfy(log_dir())
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/api/comfy/stop", dependencies=[Depends(require_token)])
async def api_comfy_stop() -> dict[str, Any]:
    try:
        return await stop_comfy()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/comfy/restart", dependencies=[Depends(require_token)])
async def api_comfy_restart() -> dict[str, Any]:
    try:
        await stop_comfy()
    except RuntimeError:
        pass
    await asyncio.sleep(1.5)
    return await start_comfy(log_dir())


# ---- Danbooru ----

def _detected_proxy_url() -> str | None:
    configured = (CONFIG.get("proxy_url") or os.getenv("CANVAS_PROXY") or "").strip()
    if configured:
        return configured
    proxies = getproxies()
    return proxies.get("https") or proxies.get("http")


async def _danbooru_http_client() -> httpx.AsyncClient:
    global _danbooru_client
    if _danbooru_client is not None and not _danbooru_client.is_closed:
        return _danbooru_client
    async with _danbooru_client_lock:
        if _danbooru_client is None or _danbooru_client.is_closed:
            _danbooru_client = httpx.AsyncClient(
                timeout=httpx.Timeout(45.0, connect=15.0),
                follow_redirects=True,
                proxy=_detected_proxy_url(),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=12, keepalive_expiry=60),
                headers={
                    "User-Agent": f"CanvasGateway/{APP_VERSION} private tailnet client",
                    "Accept": "application/json,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                },
            )
    return _danbooru_client


async def close_danbooru_client() -> None:
    global _danbooru_client
    if _danbooru_client is not None and not _danbooru_client.is_closed:
        await _danbooru_client.aclose()
    _danbooru_client = None


def _fresh_cache(cache: dict, key: Any) -> Any | None:
    entry = cache.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if expires_at <= time.time():
        cache.pop(key, None)
        return None
    return value


async def _fetch_danbooru_search(tags: str, page: int, limit: int) -> dict[str, Any]:
    key = (tags.casefold(), page, limit)
    cached = _fresh_cache(_danbooru_search_cache, key)
    if cached is not None:
        return cached
    base = CONFIG["danbooru_base_url"].rstrip("/")
    request_limit = min(limit + 1, 200)
    client = await _danbooru_http_client()
    response = await client.get(f"{base}/posts.json", params={"tags": tags, "page": page, "limit": request_limit})
    response.raise_for_status()
    raw_posts = response.json()
    if not isinstance(raw_posts, list):
        raw_posts = []
    raw_count = len(raw_posts)
    posts = [item for post in raw_posts if (item := _normalize_danbooru_post(post))]
    result = {
        "items": posts[:limit],
        "page": page,
        "limit": limit,
        "has_more": raw_count > limit,
        "raw_count": raw_count,
        "proxy": bool(_detected_proxy_url()),
    }
    _danbooru_search_cache[key] = (time.time() + 120, result)
    return result


async def _prefetch_danbooru_page(tags: str, page: int, limit: int) -> None:
    try:
        await _fetch_danbooru_search(tags, page, limit)
    except (httpx.HTTPError, ValueError):
        pass


def _normalize_danbooru_post(post: dict[str, Any]) -> dict[str, Any] | None:
    original_url = post.get("file_url") or post.get("large_file_url")
    preview_url = post.get("preview_file_url") or post.get("large_file_url") or post.get("file_url")
    if not preview_url:
        return None
    tags = post.get("tag_string") or " ".join(
        value for value in [
            post.get("tag_string_artist", ""),
            post.get("tag_string_copyright", ""),
            post.get("tag_string_character", ""),
            post.get("tag_string_general", ""),
            post.get("tag_string_meta", ""),
        ] if value
    )
    return {
        "id": post.get("id"),
        "rating": post.get("rating"),
        "score": post.get("score"),
        "created_at": post.get("created_at"),
        "source": post.get("source"),
        "tags": tags.replace(" ", ", "),
        "raw_tags": tags,
        "tag_string_artist": post.get("tag_string_artist", ""),
        "tag_string_copyright": post.get("tag_string_copyright", ""),
        "tag_string_character": post.get("tag_string_character", ""),
        "tag_string_general": post.get("tag_string_general", ""),
        "tag_string_meta": post.get("tag_string_meta", ""),
        "image_width": post.get("image_width"),
        "image_height": post.get("image_height"),
        "preview_url": preview_url,
        "sample_url": post.get("large_file_url") or post.get("file_url") or preview_url,
        "file_url": original_url or preview_url,
        "original_url": original_url or preview_url,
    }


def _normalize_danbooru_autocomplete(item: dict[str, Any]) -> dict[str, Any] | None:
    value = item.get("value") or item.get("name") or item.get("label")
    if not value:
        tag = item.get("tag")
        if isinstance(tag, dict):
            value = tag.get("name")
    if not value:
        return None
    tag = item.get("tag") if isinstance(item.get("tag"), dict) else {}
    category = item.get("category", tag.get("category", 0))
    post_count = item.get("post_count", tag.get("post_count", 0))
    label = item.get("label") or str(value).replace("_", " ")
    return {
        "value": str(value),
        "label": str(label),
        "type": item.get("type", "tag-word"),
        "category": int(category or 0),
        "category_name": {0: "general", 1: "artist", 3: "copyright", 4: "character", 5: "meta"}.get(
            int(category or 0), "general"
        ),
        "post_count": int(post_count or 0),
        "is_deprecated": bool(tag.get("is_deprecated", False)),
    }


def _assert_allowed_danbooru_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="只允许 HTTPS 图片")
    host = (parsed.hostname or "").lower()
    allowed = host == "danbooru.donmai.us" or host.endswith(".donmai.us")
    if not allowed:
        raise HTTPException(status_code=400, detail="只允许代理 Danbooru 图片")
    return value


@router.get("/api/danbooru/search", dependencies=[Depends(require_token)])
async def danbooru_search(
    tags: str = Query(default="", max_length=500),
    page: int = Query(default=1, ge=1, le=1000),
    limit: int = Query(default=40, ge=1, le=80),
) -> dict[str, Any]:
    try:
        result = await _fetch_danbooru_search(tags, page, limit)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Danbooru 返回错误: {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"无法访问 Danbooru: {exc}") from exc
    if result.get("has_more"):
        asyncio.create_task(_prefetch_danbooru_page(tags, page + 1, limit))
    return result


@router.get("/api/danbooru/autocomplete", dependencies=[Depends(require_token)])
async def danbooru_autocomplete(
    query: str = Query(default="", min_length=1, max_length=120),
    limit: int = Query(default=10, ge=1, le=20),
) -> dict[str, Any]:
    key = (query.casefold(), limit)
    cached = _fresh_cache(_danbooru_autocomplete_cache, key)
    if cached is not None:
        return cached
    base = CONFIG["danbooru_base_url"].rstrip("/")
    params = {"search[query]": query, "search[type]": "tag_query", "limit": limit}
    try:
        client = await _danbooru_http_client()
        response = await client.get(f"{base}/autocomplete.json", params=params)
        response.raise_for_status()
        raw_items = response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Danbooru 自动补全返回错误: {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"无法访问 Danbooru 自动补全: {exc}") from exc
    items = [item for raw in raw_items if (item := _normalize_danbooru_autocomplete(raw))]
    result = {"items": items, "query": query, "limit": limit, "proxy": bool(_detected_proxy_url())}
    _danbooru_autocomplete_cache[key] = (time.time() + 300, result)
    return result


@router.get("/api/danbooru/image", dependencies=[Depends(require_token)])
async def danbooru_image(url: str = Query(..., max_length=2000)) -> Response:
    global _danbooru_image_cache_bytes
    safe_url = _assert_allowed_danbooru_url(url)
    cached = _danbooru_image_cache.get(safe_url)
    if cached and cached[0] > time.time():
        _danbooru_image_cache.move_to_end(safe_url)
        return Response(content=cached[1], media_type=cached[2], headers={"X-Canvas-Cache": "HIT"})
    if cached:
        _danbooru_image_cache_bytes -= len(cached[1])
        _danbooru_image_cache.pop(safe_url, None)
    try:
        client = await _danbooru_http_client()
        response = await client.get(safe_url)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"图片请求失败: {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"无法读取图片: {exc}") from exc
    media_type = response.headers.get("content-type") or mimetypes.guess_type(safe_url)[0] or "application/octet-stream"
    if not media_type.startswith("image/"):
        raise HTTPException(status_code=502, detail="Danbooru 返回的不是图片")
    content = response.content
    if len(content) <= 4 * 1024 * 1024:
        _danbooru_image_cache[safe_url] = (time.time() + 900, content, media_type)
        _danbooru_image_cache_bytes += len(content)
        while (_danbooru_image_cache_bytes > _DANBOORU_IMAGE_CACHE_MAX_BYTES
               or len(_danbooru_image_cache) > _DANBOORU_IMAGE_CACHE_MAX_ITEMS):
            _, (_, old_content, _) = _danbooru_image_cache.popitem(last=False)
            _danbooru_image_cache_bytes -= len(old_content)
    return Response(content=content, media_type=media_type, headers={"X-Canvas-Cache": "MISS"})


# ---- tagger ----

DROP_PROMPT_TAGS = {
    "highres", "absurdres", "commentary", "english_commentary",
    "commentary_request", "twitter_username",
}


def _decode_tagger_image(image: str, original_filename: str) -> tuple[bytes, str, str]:
    encoded = image.strip()
    declared_media_type = ""
    if encoded.lower().startswith("data:"):
        header, separator, encoded = encoded.partition(",")
        if not separator or ";base64" not in header.lower():
            raise HTTPException(status_code=400, detail="WD14 image data URI must contain Base64 data")
        declared_media_type = header[5:].split(";", 1)[0].strip().lower()
    try:
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="WD14 image is not valid Base64 data") from exc
    if not content:
        raise HTTPException(status_code=400, detail="WD14 image is empty")
    if len(content) > _WD14_MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="WD14 image exceeds the 16 MB limit")

    suffix = Path(original_filename.replace("\\", "/")).suffix.lower()
    allowed_suffixes = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
    if suffix not in allowed_suffixes:
        suffix = mimetypes.guess_extension(declared_media_type) or ".png"
        if suffix not in allowed_suffixes:
            suffix = ".png"
    media_type = declared_media_type if declared_media_type.startswith("image/") else ""
    if not media_type:
        media_type = mimetypes.guess_type(f"image{suffix}")[0] or "image/png"
    upload_name = f"canvas-wd14-{uuid.uuid4().hex}{suffix}"
    return content, upload_name, media_type


async def _upload_tagger_image(
    client: httpx.AsyncClient,
    content: bytes,
    filename: str,
    media_type: str,
) -> str:
    response = await client.post(
        f"{CONFIG['comfy_url']}/upload/image",
        files={"image": (filename, content, media_type)},
        data={"type": "input", "subfolder": _WD14_UPLOAD_SUBFOLDER, "overwrite": "false"},
    )
    response.raise_for_status()
    body = response.json()
    name = Path(str(body.get("name") or "").replace("\\", "/")).name
    if not name:
        raise HTTPException(status_code=502, detail="ComfyUI accepted the WD14 upload but returned no filename")
    subfolder = str(body.get("subfolder") or _WD14_UPLOAD_SUBFOLDER).replace("\\", "/").strip("/")
    return f"{subfolder}/{name}" if subfolder else name


async def _wd14_required_inputs(client: httpx.AsyncClient) -> set[str]:
    global _wd14_required_inputs_cache
    if _wd14_required_inputs_cache is not None:
        return _wd14_required_inputs_cache
    defaults = {
        "image", "model", "threshold", "character_threshold",
        "replace_underscore", "trailing_comma", "exclude_tags",
    }
    try:
        response = await client.get(f"{CONFIG['comfy_url']}/object_info/WD14Tagger%7Cpysssss")
        response.raise_for_status()
        node_info = response.json().get("WD14Tagger|pysssss", {})
        required = set(node_info.get("input", {}).get("required", {}).keys())
        if required:
            _wd14_required_inputs_cache = required
            return required
    except (httpx.HTTPError, ValueError, TypeError):
        pass
    return defaults


def _build_wd14_inputs(threshold: float, required: set[str]) -> dict[str, Any]:
    candidates: dict[str, Any] = {
        "image": ["1", 0],
        "model": "wd-v1-4-moat-tagger-v2",
        "threshold": threshold,
        "character_threshold": 0.85,
        "replace_underscore": True,
        "trailing_comma": False,
        "exclude_tags": "",
    }
    inputs = {name: value for name, value in candidates.items() if name in required}
    if "image" not in inputs:
        inputs["image"] = ["1", 0]
    return inputs


def _remove_uploaded_tagger_image(image_ref: str | None) -> None:
    if not image_ref:
        return
    workdir = str(CONFIG.get("comfy_workdir") or "").strip()
    if not workdir:
        return
    try:
        input_root = (Path(workdir) / "input").resolve()
        candidate = (input_root / Path(image_ref.replace("/", os.sep))).resolve()
        if candidate.is_relative_to(input_root):
            candidate.unlink(missing_ok=True)
    except OSError:
        pass


def _tagger_output_text(outputs: dict[str, Any]) -> str | None:
    for node_output in outputs.values():
        if not isinstance(node_output, dict):
            continue
        value = node_output.get("text")
        if value is None:
            value = node_output.get("tags")
        if value is None:
            continue
        return ", ".join(str(item) for item in value) if isinstance(value, list) else str(value)
    return None


def _split_prompt_tags(text: str) -> list[str]:
    normalized = text.replace("\r", "\n").replace("\n", ",")
    if "," in normalized:
        return [part.strip() for part in normalized.split(",") if part.strip()]
    return [part.strip() for part in normalized.split() if part.strip()]


def _normalize_prompt_tag(tag: str) -> str | None:
    raw = tag.strip()
    if not raw:
        return None
    key = raw.replace(" ", "_").lower()
    if key in DROP_PROMPT_TAGS or key.endswith("_username"):
        return None
    value = raw.replace("\\(", "(").replace("\\)", ")")
    value = value.replace("_", " ")
    value = value.replace("(", r"\(").replace(")", r"\)")
    return value.strip()


def normalize_prompt_tags(text: str) -> tuple[str, list[str]]:
    seen: set[str] = set()
    items: list[str] = []
    for raw in _split_prompt_tags(text):
        item = _normalize_prompt_tag(raw)
        if not item:
            continue
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        items.append(item)
    return ", ".join(items), items


@router.get("/api/tagger/status", dependencies=[Depends(require_token)])
async def tagger_status() -> dict[str, Any]:
    return {
        "available": False,
        "normalizer": True,
        "message": "AI 图片反推功能需要配置 WD14 tagger 工作流；本版提供 Danbooru tags 清洗/规范化。",
    }


@router.post("/api/tagger/normalize", dependencies=[Depends(require_token)])
async def tagger_normalize(payload: TagNormalizeRequest) -> dict[str, Any]:
    text, items = normalize_prompt_tags(payload.text)
    return {"text": text, "items": items, "count": len(items)}


@router.post("/api/tagger/interrogate", dependencies=[Depends(require_token)])
async def tagger_interrogate(payload: TagInterrogateRequest) -> dict[str, Any]:
    if not await comfy_available():
        raise HTTPException(status_code=503, detail="ComfyUI 尚未启动，无法运行 WD14 反推")

    job_id = uuid.uuid4().hex
    client_id = f"canvas-tagger-{job_id}"
    image_content, upload_name, media_type = _decode_tagger_image(payload.image, payload.filename)
    uploaded_ref: str | None = None
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            uploaded_ref = await _upload_tagger_image(client, image_content, upload_name, media_type)
            required_inputs = await _wd14_required_inputs(client)
    except httpx.HTTPError as exc:
        detail = exc.response.text[:1000] if isinstance(exc, httpx.HTTPStatusError) else str(exc)
        raise HTTPException(status_code=502, detail=f"ComfyUI rejected the WD14 image upload: {detail}") from exc

    workflow = {
        "1": {
            "inputs": {"image": uploaded_ref},
            "class_type": "LoadImage",
            "_meta": {"title": "LoadImage"},
        },
        "2": {
            "inputs": _build_wd14_inputs(payload.threshold, required_inputs),
            "class_type": "WD14Tagger|pysssss",
            "_meta": {"title": "WD14 Tagger"},
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{CONFIG['comfy_url']}/prompt",
                json={"prompt": workflow, "client_id": client_id},
            )
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPError as exc:
        detail = exc.response.text[:1000] if isinstance(exc, httpx.HTTPStatusError) else str(exc)
        _remove_uploaded_tagger_image(uploaded_ref)
        raise HTTPException(status_code=502, detail=f"ComfyUI 拒绝 WD14 工作流: {detail}") from exc

    prompt_id = body["prompt_id"]
    deadline = time.time() + 60
    async with httpx.AsyncClient(timeout=30) as client:
        while time.time() < deadline:
            try:
                response = await client.get(f"{CONFIG['comfy_url']}/history/{prompt_id}")
                response.raise_for_status()
            except httpx.HTTPError as exc:
                _remove_uploaded_tagger_image(uploaded_ref)
                raise HTTPException(status_code=502, detail=f"Cannot read WD14 result from ComfyUI: {exc}") from exc
            history = response.json()
            item = history.get(prompt_id)
            if item:
                status = item.get("status", {})
                if status.get("status_str") == "error" or not status.get("completed", True):
                    messages = status.get("messages", [])
                    _remove_uploaded_tagger_image(uploaded_ref)
                    raise HTTPException(
                        status_code=502,
                        detail=f"WD14 执行失败: {messages[-1] if messages else '未知错误'}",
                    )
                outputs = item.get("outputs", {})
                raw_text = _tagger_output_text(outputs)
                if raw_text is not None:
                    normalized, items = normalize_prompt_tags(raw_text)
                    _remove_uploaded_tagger_image(uploaded_ref)
                    return {
                        "text": normalized,
                        "raw_text": raw_text,
                        "items": items,
                        "count": len(items),
                        "model": "wd14-tagger",
                    }
                _remove_uploaded_tagger_image(uploaded_ref)
                raise HTTPException(status_code=502, detail="WD14 工作流完成但没有输出标签")
            await asyncio.sleep(1.5)
    _remove_uploaded_tagger_image(uploaded_ref)
    raise HTTPException(status_code=504, detail="WD14 反推超时（60秒）")


# ---- Tavern image attach ----

def _tavern_images_state() -> dict[str, Any]:
    value = get_state().setdefault("tavern_images", {})
    if not isinstance(value, dict):
        value = {}
        get_state()["tavern_images"] = value
    return value


def _safe_tavern_image_path(image_id: str) -> Path:
    if not image_id or not all(ch.isalnum() or ch in {"-", "_"} for ch in image_id):
        raise HTTPException(status_code=404, detail="Tavern image not found")
    entry = _tavern_images_state().get(image_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Tavern image not found")
    base = tavern_images_dir().resolve()
    candidate = Path(entry.get("path", "")).resolve()
    try:
        candidate.relative_to(base)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Tavern image path invalid") from exc
    if not candidate.exists():
        raise HTTPException(status_code=410, detail="Tavern image has been removed")
    return candidate


@router.post("/api/tavern/jobs/{job_id}/attach", dependencies=[Depends(require_token)])
async def tavern_attach_job_image(job_id: str, index: int = Query(default=0, ge=0)) -> dict[str, Any]:
    import shutil

    job = get_jobs().get(job_id)
    if not job or job.get("status") != "complete":
        raise HTTPException(status_code=404, detail="图片尚未生成")
    results = job.get("results", [])
    if index >= len(results):
        raise HTTPException(status_code=404, detail="图片索引不存在")
    source = Path(results[index]["path"])
    if not source.exists():
        raise HTTPException(status_code=410, detail="图片已按保留策略删除")

    image_id = uuid.uuid4().hex
    destination = tavern_images_dir() / f"{image_id}.png"
    await asyncio.to_thread(shutil.copy2, source, destination)
    entry = {
        "id": image_id,
        "job_id": job_id,
        "index": index,
        "path": str(destination),
        "created_at": time.time(),
        "prompt_id": job.get("prompt_id"),
    }
    _tavern_images_state()[image_id] = entry
    save_state()
    return {
        "image_id": image_id,
        "path": f"/api/tavern/images/{image_id}",
        "retention_hours": CONFIG.get("tavern_image_retention_hours", 720),
    }


@router.get("/api/tavern/images/{image_id}", dependencies=[Depends(require_token)])
async def tavern_image(image_id: str) -> FileResponse:
    path = _safe_tavern_image_path(image_id)
    entry = _tavern_images_state().get(image_id, {})
    entry["last_accessed_at"] = time.time()
    save_state()
    return FileResponse(path, media_type="image/png", filename=f"canvas-tavern-{image_id}.png")


# ---- external API ----

def _external_api_key() -> str:
    state = get_state()
    key = state.get("external_api_key")
    if not key:
        key = secrets.token_urlsafe(32)
        state["external_api_key"] = key
        save_state()
    return key


def _verify_external_api_key(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="需要外部 API Key")
    expected = get_state().get("external_api_key")
    if not expected or not secrets.compare_digest(authorization[7:], expected):
        raise HTTPException(status_code=401, detail="无效的外部 API Key")


@router.get("/api/external/key", dependencies=[Depends(require_token)])
async def external_key() -> dict[str, str]:
    return {"api_key": _external_api_key()}


@router.post("/api/external/key/rotate", dependencies=[Depends(require_token)])
async def external_key_rotate() -> dict[str, str]:
    new_key = secrets.token_urlsafe(32)
    get_state()["external_api_key"] = new_key
    save_state()
    return {"api_key": new_key}


@router.post("/api/external/generate")
async def external_generate(
    payload: ExternalGenerateRequest,
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    _verify_external_api_key(authorization)
    if not await comfy_available():
        raise HTTPException(status_code=503, detail="ComfyUI 尚未启动")
    job_id = uuid.uuid4().hex
    client_id = f"canvas-ext-{job_id}"
    workflow_def = workflow_definition(payload.workflow_id)
    try:
        workflow = build_workflow(payload, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    jobs = get_jobs()
    jobs[job_id] = {
        "id": job_id,
        "prompt_id": "",
        "status": "submitting",
        "stage": "Connecting to ComfyUI",
        "progress": 0,
        "created_at": time.time(),
        "checkpoint": payload.checkpoint,
        "workflow_id": workflow_def.get("id"),
        "workflow_label": workflow_def.get("label"),
        "prompt": payload.prompt,
        "negative_prompt": payload.negative_prompt,
        "width": payload.width,
        "height": payload.height,
        "steps": payload.steps,
        "cfg": payload.cfg,
        "sampler_name": payload.sampler_name,
        "scheduler": payload.scheduler,
        "hires_steps": payload.hires_steps,
        "hires_cfg": payload.hires_cfg,
        "hires_denoise": payload.hires_denoise,
        "hires_sampler_name": payload.hires_sampler_name,
        "hires_scheduler": payload.hires_scheduler,
        "seed": payload.seed,
        "loras": [item.model_dump() for item in (payload.loras or [])],
        "image_token": secrets.token_urlsafe(24),
        "sampler_nodes": _sampler_nodes(workflow_def),
    }
    progress_task = asyncio.create_task(track_progress(job_id, "", client_id, jobs))
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{CONFIG['comfy_url']}/prompt",
                json={"prompt": workflow, "client_id": client_id},
            )
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPStatusError as exc:
        progress_task.cancel()
        jobs.pop(job_id, None)
        detail = exc.response.text[:1000]
        raise HTTPException(status_code=502, detail=f"ComfyUI 拒绝工作流: {detail}") from exc
    except httpx.HTTPError as exc:
        progress_task.cancel()
        jobs.pop(job_id, None)
        raise HTTPException(status_code=502, detail=f"Cannot submit workflow to ComfyUI: {exc}") from exc
    prompt_id = body["prompt_id"]
    jobs[job_id].update({
        "prompt_id": prompt_id,
        "status": "queued",
        "stage": "Queued",
        "progress": max(0, int(jobs[job_id].get("progress") or 0)),
        "submitted_at": time.time(),
    })
    asyncio.create_task(monitor_job(job_id, prompt_id, client_id, jobs, results_dir(), progress_task))
    return JSONResponse({"job_id": job_id, "status": "queued"}, status_code=202)
