from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path


TEST_DATA_DIR = Path(tempfile.gettempdir()) / f"canvas-gateway-test-{os.getpid()}"
os.environ["CANVAS_DATA_DIR"] = str(TEST_DATA_DIR)
os.environ["CANVAS_CONFIG"] = str(TEST_DATA_DIR / "config.json")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import app as gateway_app
from canvas_gateway.routes import set_pairing


def test_app_only_surface() -> None:
    set_pairing("12345678", time.time() + 60)

    with TestClient(gateway_app.app) as client:
        root = client.get("/")
        assert root.status_code == 200
        assert root.json()["mode"] == "app-only"

        assert client.get("/web").status_code == 404
        assert client.get("/api/public/status").status_code == 404

        paired = client.post("/api/pair", json={"code": "12345678"})
        assert paired.status_code == 200
        assert paired.json().get("token")


def test_cors_only_allows_canvas_local_origins() -> None:
    with TestClient(gateway_app.app) as client:
        allowed = client.options(
            "/api/pair",
            headers={
                "Origin": "https://localhost",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert allowed.status_code == 200
        assert allowed.headers.get("access-control-allow-origin") == "https://localhost"

        blocked = client.options(
            "/api/pair",
            headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert blocked.status_code == 400
        assert "access-control-allow-origin" not in blocked.headers


def test_pairing_failures_are_rate_limited() -> None:
    set_pairing("12345678", time.time() + 60)
    with TestClient(gateway_app.app) as client:
        for _ in range(8):
            rejected = client.post("/api/pair", json={"code": "00000000"})
            assert rejected.status_code == 403

        limited = client.post("/api/pair", json={"code": "00000000"})
        assert limited.status_code == 429
        assert int(limited.headers["retry-after"]) >= 1
