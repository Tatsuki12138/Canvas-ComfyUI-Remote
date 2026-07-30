from __future__ import annotations

import asyncio
import copy
import json
import os
import secrets
import subprocess
import time
from pathlib import Path
from typing import Any

import httpx

from .config import load_config, resolve_package_path

try:
    import websockets
except ImportError:
    websockets = None

CONFIG = load_config()
COMFY_START_LOCK = asyncio.Lock()
COMFY_STARTING_MAX_AGE = 4 * 60


# ---- helpers ----

def _comfy_port() -> int:
    from urllib.parse import urlparse

    parsed = urlparse(CONFIG["comfy_url"])
    return parsed.port or (443 if parsed.scheme == "https" else 80)


def _comfy_ws_url(client_id: str) -> str:
    from urllib.parse import urlencode, urlparse, urlunparse

    parsed = urlparse(CONFIG["comfy_url"])
    scheme = "wss" if parsed.scheme == "https" else "ws"
    query = urlencode({"clientId": client_id})
    return urlunparse((scheme, parsed.netloc, "/ws", "", query, ""))


# ---- availability ----

async def comfy_available(timeout: float = 2.5) -> bool:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{CONFIG['comfy_url']}/system_stats")
            return response.is_success
    except httpx.HTTPError:
        return False


async def comfy_system_stats() -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(timeout=3.5) as client:
            response = await client.get(f"{CONFIG['comfy_url']}/system_stats")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError:
        return None


# ---- process detection (Windows) ----

def pid_listening_on_port(port: int) -> int | None:
    if os.name != "nt":
        return None
    try:
        output = subprocess.check_output(
            ["netstat", "-ano", "-p", "tcp"], text=True, errors="ignore", timeout=10
        )
    except (OSError, subprocess.SubprocessError):
        return None
    needle = f":{port}"
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[0].upper().startswith("TCP") and parts[-2].upper() == "LISTENING":
            local_address = parts[1]
            if local_address.endswith(needle):
                try:
                    return int(parts[-1])
                except ValueError:
                    return None
    return None


def process_exists(pid: int | str | None) -> bool:
    if not pid:
        return False
    try:
        value = int(pid)
    except (TypeError, ValueError):
        return False
    if os.name == "nt":
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {value}", "/FO", "CSV", "/NH"],
                check=False, capture_output=True, text=True, errors="ignore", timeout=8,
            )
        except (OSError, subprocess.SubprocessError):
            return False
        return str(value) in result.stdout
    try:
        os.kill(value, 0)
        return True
    except OSError:
        return False


# ---- state helpers ----

def _state() -> dict[str, Any]:
    from .runtime import get_state
    return get_state()


def _save_state() -> None:
    from .runtime import save_state
    save_state()


def clear_comfy_process_state() -> None:
    state = _state()
    changed = False
    for key in ("comfy_pid", "comfy_started_at", "comfy_starting"):
        if key in state:
            state.pop(key, None)
            changed = True
    if changed:
        _save_state()


def mark_comfy_ready(pid: int | None = None) -> None:
    state = _state()
    if pid:
        state["comfy_pid"] = pid
    state["comfy_starting"] = False
    state["comfy_started_at"] = time.time()
    _save_state()


def comfy_starting_state() -> bool:
    state = _state()
    pid = state.get("comfy_pid")
    started_at = float(state.get("comfy_started_at") or 0)
    fresh = started_at > 0 and time.time() - started_at < COMFY_STARTING_MAX_AGE
    if state.get("comfy_starting") and fresh and process_exists(pid):
        return True
    if state.get("comfy_starting"):
        clear_comfy_process_state()
    return False


async def wait_for_comfy(available: bool, timeout: float = 120) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if await comfy_available(timeout=2) is available:
            return True
        await asyncio.sleep(1.5)
    return await comfy_available(timeout=2) is available


# ---- start / stop ----

async def start_comfy(log_dir: Path) -> dict[str, Any]:
    if await comfy_available():
        pid = pid_listening_on_port(_comfy_port())
        mark_comfy_ready(pid)
        return {"running": True, "starting": False, "message": "ComfyUI 已经在运行", "pid": pid}

    if COMFY_START_LOCK.locked() or comfy_starting_state():
        return {
            "running": False,
            "starting": True,
            "message": "ComfyUI 正在启动中，请稍等",
            "pid": _state().get("comfy_pid"),
        }

    async with COMFY_START_LOCK:
        if await comfy_available():
            pid = pid_listening_on_port(_comfy_port())
            mark_comfy_ready(pid)
            return {"running": True, "starting": False, "message": "ComfyUI 已经在运行", "pid": pid}
        if comfy_starting_state():
            return {
                "running": False,
                "starting": True,
                "message": "ComfyUI 正在启动中，请稍等",
                "pid": _state().get("comfy_pid"),
            }

        python_exe = Path(CONFIG["comfy_python"])
        workdir = Path(CONFIG["comfy_workdir"])
        args = list(CONFIG.get("comfy_args") or ["main.py", "--listen", "127.0.0.1", "--port", "8188"])

        if not python_exe.exists():
            raise RuntimeError(f"找不到 Python: {python_exe}")
        if not workdir.exists():
            raise RuntimeError(f"找不到 ComfyUI 目录: {workdir}")

        stdout_path = log_dir / "comfyui.out.log"
        stderr_path = log_dir / "comfyui.err.log"
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        stdout = stdout_path.open("ab")
        stderr = stderr_path.open("ab")
        try:
            process = subprocess.Popen(
                [str(python_exe), *args],
                cwd=str(workdir),
                stdout=stdout,
                stderr=stderr,
                stdin=subprocess.DEVNULL,
                creationflags=creationflags,
            )
        finally:
            stdout.close()
            stderr.close()

        _state().update({"comfy_pid": process.pid, "comfy_started_at": time.time(), "comfy_starting": True})
        _save_state()

        ready = await wait_for_comfy(True, timeout=30)
        if ready:
            mark_comfy_ready(process.pid)
        return {
            "running": ready,
            "starting": not ready,
            "pid": process.pid,
            "message": "ComfyUI 已启动" if ready else "ComfyUI 正在启动（请等待）",
        }


async def stop_comfy() -> dict[str, Any]:
    state = _state()
    state_pid = state.get("comfy_pid")
    port_pid = pid_listening_on_port(_comfy_port())
    pid = state_pid if process_exists(state_pid) else port_pid
    if not pid:
        clear_comfy_process_state()
        return {"running": False, "message": "没有发现正在运行的 ComfyUI"}
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False, capture_output=True, text=True, timeout=20)
        else:
            subprocess.run(["kill", str(pid)], check=False, timeout=20)
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError(f"停止 ComfyUI 失败: {exc}") from exc
    clear_comfy_process_state()
    stopped = await wait_for_comfy(False, timeout=15)
    return {"running": not stopped, "message": "ComfyUI 已停止" if stopped else "已发送停止命令", "pid": pid}


# ---- workflow handling ----

def workflow_definitions() -> list[dict[str, Any]]:
    items = CONFIG.get("workflows") or []
    if not isinstance(items, list) or not items:
        return [{"id": "anima_base", "label": "Anima Base"}]
    return items


def workflow_definition(workflow_id: str | None = None) -> dict[str, Any]:
    target = workflow_id or CONFIG.get("default_workflow", "anima_base")
    workflows = workflow_definitions()
    for item in workflows:
        if item.get("id") == target:
            return item
    for item in workflows:
        if item.get("id") == CONFIG.get("default_workflow"):
            return item
    return workflows[0]


def workflow_path(workflow: dict[str, Any] | None = None) -> Path:
    if workflow is None:
        workflow = workflow_definition()
    return resolve_package_path(workflow.get("path", "workflow_api.json"))


def read_workflow_template(workflow_def: dict[str, Any] | None = None) -> dict[str, Any]:
    path = workflow_path(workflow_def)
    if not path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="尚未配置 API 格式工作流")
    data = json.loads(path.read_text(encoding="utf-8"))
    if "nodes" in data:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="当前文件不是 API 格式工作流")
    return data


def workflow_node_map(workflow_def: dict[str, Any]) -> dict[str, Any]:
    return workflow_def.get("node_map") or {}


def patch_input(workflow: dict[str, Any], workflow_def: dict[str, Any], name: str, value: Any) -> None:
    target = workflow_node_map(workflow_def).get(name)
    if not target:
        return
    node_id = str(target["node"])
    if node_id not in workflow:
        raise ValueError(f"工作流缺少节点 {node_id} ({name})")
    workflow[node_id].setdefault("inputs", {})[target["input"]] = value


def patch_lora_stack(workflow: dict[str, Any], workflow_def: dict[str, Any], loras: list[Any] | None) -> None:
    if loras is None:
        return
    target = workflow_node_map(workflow_def).get("lora_stack")
    if not target:
        return
    node_id = str(target["node"])
    if node_id not in workflow:
        raise ValueError(f"工作流缺少 LoRA 堆节点 {node_id}")
    stack = [
        {
            "lora": item.name if hasattr(item, "name") else item["name"],
            "weight": round(float(item.weight if hasattr(item, "weight") else item.get("weight", 1)), 4),
            "text_encoder_weight": round(float(
                item.text_encoder_weight
                if hasattr(item, "text_encoder_weight") and item.text_encoder_weight is not None
                else item.get("text_encoder_weight") or item.weight if hasattr(item, "weight") else item.get("weight", 1)
            ), 4),
        }
        for item in loras
    ]
    inputs = workflow[node_id].setdefault("inputs", {})
    inputs[target["input"]] = json.dumps(stack, ensure_ascii=False)
    if "temp_lora_str" in inputs:
        inputs["temp_lora_str"] = "[]"


def detect_base_model_target(
    workflow: dict[str, Any], workflow_def: dict[str, Any] | None = None
) -> tuple[str, str, str] | None:
    node_map = workflow_node_map(workflow_def or workflow_definition())
    configured = node_map.get("base_model") or node_map.get("checkpoint")
    if configured:
        node_id = str(configured["node"])
        node = workflow.get(node_id)
        if node and configured.get("input") in node.get("inputs", {}):
            return node_id, str(configured["input"]), node.get("class_type", "")

    preferred_inputs = ("ckpt_name", "unet_name", "model_name")
    preferred_classes = ("CheckpointLoaderSimple", "CheckpointLoader", "UNETLoader")
    for class_name in preferred_classes:
        for node_id, node in workflow.items():
            if node.get("class_type") != class_name:
                continue
            inputs = node.get("inputs", {})
            for input_name in preferred_inputs:
                if input_name in inputs:
                    return str(node_id), input_name, class_name
    return None


def patch_base_model(workflow: dict[str, Any], workflow_def: dict[str, Any], checkpoint: str | None) -> None:
    if not checkpoint:
        return
    checkpoint = checkpoint.replace("\\", "/").strip()
    if not checkpoint or checkpoint.startswith("/") or ".." in Path(checkpoint).parts:
        raise ValueError("Invalid base model name")
    target = detect_base_model_target(workflow, workflow_def)
    if not target:
        raise ValueError("Current workflow does not expose a base model input")
    node_id, input_name, _class_name = target
    workflow[node_id].setdefault("inputs", {})[input_name] = checkpoint


def build_workflow(payload: Any, job_id: str) -> dict[str, Any]:
    """Build a ComfyUI API-format workflow from a GenerateRequest or ExternalGenerateRequest."""
    workflow_def = workflow_definition(payload.workflow_id)
    workflow = copy.deepcopy(read_workflow_template(workflow_def))
    seed = payload.seed if payload.seed >= 0 else secrets.randbelow(2**63 - 1)

    patch_input(workflow, workflow_def, "positive", payload.prompt)
    patch_input(workflow, workflow_def, "negative", payload.negative_prompt)
    patch_input(workflow, workflow_def, "width", payload.width)
    patch_input(workflow, workflow_def, "height", payload.height)
    patch_input(workflow, workflow_def, "steps", payload.steps)
    patch_input(workflow, workflow_def, "cfg", payload.cfg)
    patch_input(workflow, workflow_def, "seed", seed)
    patch_input(workflow, workflow_def, "hires_seed", seed)
    patch_input(workflow, workflow_def, "filename_prefix", f"CanvasTemp/{job_id}")

    # sampler / scheduler (first pass)
    if getattr(payload, "sampler_name", None):
        patch_input(workflow, workflow_def, "sampler_name", payload.sampler_name)
    if getattr(payload, "scheduler", None):
        patch_input(workflow, workflow_def, "scheduler", payload.scheduler)

    # hi-res parameters
    if getattr(payload, "hires_steps", None) is not None:
        patch_input(workflow, workflow_def, "hires_steps", payload.hires_steps)
    if getattr(payload, "hires_cfg", None) is not None:
        patch_input(workflow, workflow_def, "hires_cfg", payload.hires_cfg)
    if getattr(payload, "hires_denoise", None) is not None:
        patch_input(workflow, workflow_def, "hires_denoise", payload.hires_denoise)
    if getattr(payload, "hires_sampler_name", None):
        patch_input(workflow, workflow_def, "hires_sampler_name", payload.hires_sampler_name)
    if getattr(payload, "hires_scheduler", None):
        patch_input(workflow, workflow_def, "hires_scheduler", payload.hires_scheduler)
    if getattr(payload, "hires_kernel_size", None):
        patch_input(workflow, workflow_def, "kernel_size", payload.hires_kernel_size)

    patch_lora_stack(workflow, workflow_def, payload.loras)
    patch_base_model(workflow, workflow_def, payload.checkpoint)
    return workflow


# ---- model scanning ----

def parse_lora_stack_from_workflow(workflow_id: str | None = None) -> list[dict[str, Any]]:
    try:
        workflow_def = workflow_definition(workflow_id)
        workflow = read_workflow_template(workflow_def)
        target = workflow_node_map(workflow_def).get("lora_stack")
        if not target:
            return []
        node = workflow.get(str(target["node"]), {})
        raw = node.get("inputs", {}).get(target["input"], "")
        if not raw:
            return []
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return []
        output: list[dict[str, Any]] = []
        for item in parsed:
            if isinstance(item, dict) and item.get("lora"):
                weight = float(item.get("weight", 1))
                output.append({
                    "name": item["lora"],
                    "weight": weight,
                    "text_encoder_weight": float(item.get("text_encoder_weight", weight)),
                })
        return output
    except Exception:
        return []


def scan_loras() -> list[dict[str, Any]]:
    items: dict[str, dict[str, Any]] = {}
    for directory in CONFIG.get("lora_dirs", []):
        root = Path(directory)
        if not root.exists():
            continue
        for file in root.rglob("*"):
            if file.is_file() and file.suffix.lower() in {".safetensors", ".ckpt", ".pt"}:
                try:
                    name = file.relative_to(root).as_posix()
                except ValueError:
                    name = file.name
                if name not in items:
                    items[name] = {
                        "name": name,
                        "filename": file.name,
                        "size_mb": round(file.stat().st_size / 1024 / 1024, 1),
                    }
    return sorted(items.values(), key=lambda item: item["name"].lower())


def parse_default_base_model_from_workflow(workflow_id: str | None = None) -> dict[str, Any] | None:
    try:
        workflow_def = workflow_definition(workflow_id)
        workflow = read_workflow_template(workflow_def)
        target = detect_base_model_target(workflow, workflow_def)
        if not target:
            return None
        node_id, input_name, class_name = target
        value = workflow.get(node_id, {}).get("inputs", {}).get(input_name)
        if not value:
            return None
        return {
            "name": str(value),
            "node": node_id,
            "input": input_name,
            "loader": class_name,
            "workflow_id": workflow_def.get("id"),
        }
    except Exception:
        return None


def scan_checkpoints(workflow_id: str | None = None) -> list[dict[str, Any]]:
    workflow_def = workflow_definition(workflow_id)
    items: dict[str, dict[str, Any]] = {}
    extensions = {".safetensors", ".ckpt", ".pt"}
    include_patterns = [
        str(item).casefold()
        for item in workflow_def.get("model_include_patterns", [])
        if str(item).strip()
    ]
    for directory in workflow_def.get("model_dirs") or CONFIG.get("checkpoint_dirs", []):
        root = Path(directory)
        if not root.exists():
            continue
        kind = root.name
        for file in root.rglob("*"):
            if file.is_file() and file.suffix.lower() in extensions:
                try:
                    name = file.relative_to(root).as_posix()
                except ValueError:
                    name = file.name
                if include_patterns and not any(pattern in name.casefold() for pattern in include_patterns):
                    continue
                key = name.lower()
                if key not in items:
                    items[key] = {
                        "name": name,
                        "filename": file.name,
                        "folder": kind,
                        "kind": workflow_def.get("model_kind", "checkpoint"),
                        "size_mb": round(file.stat().st_size / 1024 / 1024, 1),
                    }
    return sorted(items.values(), key=lambda item: (item["folder"].lower(), item["name"].lower()))


# ---- job monitoring ----

async def track_progress(job_id: str, prompt_id: str, client_id: str, jobs: dict[str, Any]) -> None:
    if websockets is None:
        job = jobs.get(job_id)
        if job:
            job["progress_note"] = "ComfyUI live progress transport is unavailable"
        return
    job = jobs[job_id]
    sampler_nodes = [str(node) for node in job.get("sampler_nodes", []) if node]
    active_node = ""
    try:
        async with websockets.connect(_comfy_ws_url(client_id), max_size=None) as websocket:
            while job.get("status") not in {"complete", "error"}:
                try:
                    raw = await asyncio.wait_for(websocket.recv(), timeout=1.5)
                except asyncio.TimeoutError:
                    continue
                if not isinstance(raw, str):
                    continue
                event = json.loads(raw)
                kind = event.get("type")
                data = event.get("data") or {}
                event_prompt = data.get("prompt_id")
                if prompt_id and event_prompt and event_prompt != prompt_id:
                    continue

                if kind == "execution_start":
                    job.update({"progress": max(job.get("progress", 0), 2), "stage": "Preparing workflow"})
                elif kind == "execution_cached":
                    job.update({"progress": max(job.get("progress", 0), 8), "stage": "Using ComfyUI cache"})
                elif kind == "executing":
                    active_node = str(data.get("node") or "")
                    if not active_node:
                        job.update({"progress": max(job.get("progress", 0), 96), "stage": "Saving image"})
                    else:
                        pass_index = sampler_nodes.index(active_node) + 1 if active_node in sampler_nodes else 0
                        if pass_index:
                            job.update({
                                "progress": max(job.get("progress", 0), 5),
                                "stage": f"Pass {pass_index}/{len(sampler_nodes)} · Preparing sampler",
                                "pass_index": pass_index,
                                "pass_total": len(sampler_nodes),
                            })
                        else:
                            job.update({"progress": max(job.get("progress", 0), 5), "stage": "Preparing next stage"})
                elif kind == "progress":
                    value = int(data.get("value") or 0)
                    maximum = int(data.get("max") or 0)
                    if maximum > 0:
                        event_node = str(data.get("node") or active_node or "")
                        pass_index = sampler_nodes.index(event_node) + 1 if event_node in sampler_nodes else 1
                        pass_total = max(1, len(sampler_nodes))
                        fraction = min(1.0, max(0.0, value / maximum))
                        percent = min(95, max(5, round(5 + ((pass_index - 1 + fraction) / pass_total) * 90)))
                        stage_prefix = f"Pass {pass_index}/{pass_total} · " if pass_total > 1 else ""
                        job.update({
                            "progress": percent,
                            "stage": f"{stage_prefix}Sampling {value}/{maximum}",
                            "step": value,
                            "steps_total": maximum,
                            "pass_index": pass_index,
                            "pass_total": pass_total,
                        })
    except Exception as exc:
        job = jobs.get(job_id)
        if job and job.get("status") not in {"complete", "error"}:
            job["progress_note"] = f"websocket progress unavailable: {exc}"


async def monitor_job(
    job_id: str,
    prompt_id: str,
    client_id: str,
    jobs: dict[str, Any],
    results_dir: Path,
    progress_task: asyncio.Task | None = None,
) -> None:
    job = jobs[job_id]
    job.update({"status": "running", "progress": max(job.get("progress", 0), 1), "stage": "Queued in ComfyUI"})
    deadline = time.time() + 60 * 30
    if progress_task is None:
        progress_task = asyncio.create_task(track_progress(job_id, prompt_id, client_id, jobs))
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            while time.time() < deadline:
                response = await client.get(f"{CONFIG['comfy_url']}/history/{prompt_id}")
                response.raise_for_status()
                history = response.json()
                item = history.get(prompt_id)
                if item:
                    status = item.get("status", {})
                    if status.get("status_str") == "error" or not status.get("completed", True):
                        messages = status.get("messages", [])
                        raise RuntimeError(f"ComfyUI 执行失败: {messages[-1] if messages else '未知错误'}")

                    images: list[dict[str, Any]] = []
                    for output in item.get("outputs", {}).values():
                        images.extend(output.get("images", []))

                    if not images:
                        raise RuntimeError("工作流完成，但没有找到输出图片")

                    selected = [c for c in images if c.get("type") == "output"] or images
                    unique: list[dict[str, Any]] = []
                    seen: set[tuple[str, str, str]] = set()
                    for image in selected:
                        key = (image.get("filename", ""), image.get("subfolder", ""), image.get("type", "output"))
                        if key[0] and key not in seen:
                            seen.add(key)
                            unique.append(image)

                    comfy_completed_at = time.time()
                    job.update({
                        "progress": max(job.get("progress", 0), 98),
                        "stage": "Preparing result",
                        "comfy_completed_at": comfy_completed_at,
                        "generation_seconds": round(comfy_completed_at - float(job.get("created_at", comfy_completed_at)), 2),
                    })

                    results: list[dict[str, Any]] = []
                    base_output = Path(CONFIG["comfy_output_dir"]).resolve()

                    for index, image_info in enumerate(unique):
                        result_path = results_dir / f"{job_id}-{index}{_result_extension(image_info)}"
                        original = _safe_original_path(image_info, base_output)
                        if original and original.exists():
                            await asyncio.to_thread(_copy_file, original, result_path)
                        else:
                            from urllib.parse import urlencode
                            query = urlencode({
                                "filename": image_info["filename"],
                                "subfolder": image_info.get("subfolder", ""),
                                "type": image_info.get("type", "output"),
                            })
                            image_response = await client.get(f"{CONFIG['comfy_url']}/view?{query}")
                            image_response.raise_for_status()
                            await asyncio.to_thread(_sanitize_image, image_response.content, result_path)

                        display_path = results_dir / f"{job_id}-{index}-display.webp"
                        try:
                            await asyncio.to_thread(_make_display_image, result_path, display_path)
                        except Exception:
                            display_path = result_path

                        results.append({
                            "index": index,
                            "filename": image_info.get("filename", f"{job_id}-{index}.png"),
                            "subfolder": image_info.get("subfolder", ""),
                            "type": image_info.get("type", "output"),
                            "path": str(result_path),
                            "display_path": str(display_path),
                            "media_type": _result_media_type(result_path),
                            "display_media_type": _result_media_type(display_path),
                            "size_bytes": _file_size(result_path),
                            "display_size_bytes": _file_size(display_path),
                        })

                    # cleanup temp files in ComfyUI output
                    for original_info in images:
                        original = _safe_original_path(original_info, base_output)
                        if original and original.exists():
                            original.unlink(missing_ok=True)
                            parent = original.parent
                            if parent != base_output:
                                try:
                                    parent.rmdir()
                                except OSError:
                                    pass

                    finished_at = time.time()
                    job.update({
                        "status": "complete",
                        "progress": 100,
                        "stage": "Ready",
                        "results": results,
                        "result": results[0]["path"],
                        "finished_at": finished_at,
                        "gateway_prepare_seconds": round(finished_at - comfy_completed_at, 2),
                    })
                    return
                if job.get("progress", 0) < 5:
                    job.update({"progress": 3, "stage": "Waiting for ComfyUI"})
                await asyncio.sleep(0.4)
        raise TimeoutError("生成超过 30 分钟，已停止等待")
    except Exception as exc:
        job.update({"status": "error", "error": str(exc), "stage": "Failed", "finished_at": time.time()})
    finally:
        if progress_task:
            progress_task.cancel()


# ---- image helpers ----

def _safe_original_path(image_info: dict[str, Any], base_output: Path) -> Path | None:
    if image_info.get("type") != "output":
        return None
    candidate = (base_output / image_info.get("subfolder", "") / image_info["filename"]).resolve()
    try:
        candidate.relative_to(base_output)
    except ValueError:
        return None
    return candidate


def _sanitize_image(content: bytes, destination: Path) -> None:
    from PIL import Image
    import io
    with Image.open(io.BytesIO(content)) as source:
        clean = source.convert("RGB") if source.mode not in ("RGB", "RGBA") else source.copy()
        clean.save(destination, format="PNG", optimize=True)


def _make_display_image(source_path: Path, destination: Path, max_edge: int = 1280) -> None:
    from PIL import Image
    with Image.open(source_path) as source:
        image = source.convert("RGB")
        image.thumbnail((max_edge, max_edge), Image.Resampling.BILINEAR)
        image.save(destination, format="WEBP", quality=80, method=1)


def _copy_file(source: Path, destination: Path) -> None:
    import shutil
    shutil.copy2(source, destination)


def _result_extension(image_info: dict[str, Any]) -> str:
    suffix = Path(image_info.get("filename", "")).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return suffix
    return ".png"


def _result_media_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
    }.get(suffix, "application/octet-stream")


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0
