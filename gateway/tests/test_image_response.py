from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from canvas_gateway import runtime
from canvas_gateway.routes import _serve_job_image


async def _run_image_response_test() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        original = root / "result.png"
        display = root / "result-display.webp"
        original.write_bytes(b"original")
        display.write_bytes(b"display")

        jobs = {
            "test-job": {
                "status": "complete",
                "image_token": "test-token",
                "results": [
                    {
                        "path": str(original),
                        "media_type": "image/png",
                        "display_path": str(display),
                        "display_media_type": "image/webp",
                    }
                ],
            }
        }
        runtime.init_runtime({}, jobs, lambda: None, root, root, root, root)

        preview = await _serve_job_image("test-job", 0, "display", "test-token", None)
        download = await _serve_job_image("test-job", 0, "original", "test-token", None)

        assert preview.headers["content-disposition"].startswith("inline;")
        assert preview.headers["cache-control"] == "private, max-age=300"
        assert preview.media_type == "image/webp"
        assert download.headers["content-disposition"].startswith("attachment;")
        assert download.headers["cache-control"] == "private, no-store"
        assert download.media_type == "image/png"


def test_image_response_variants() -> None:
    asyncio.run(_run_image_response_test())


if __name__ == "__main__":
    test_image_response_variants()
