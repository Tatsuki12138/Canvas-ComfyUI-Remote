from __future__ import annotations

import base64
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from canvas_gateway.routes import (
    CONFIG,
    _build_wd14_inputs,
    _decode_tagger_image,
    _remove_uploaded_tagger_image,
    _tagger_output_text,
)


def test_wd14_bridge_compatibility() -> None:
    content = b"\x89PNG\r\n\x1a\ncanvas-test"
    encoded = base64.b64encode(content).decode("ascii")
    decoded, filename, media_type = _decode_tagger_image(encoded, "danbooru-123.png")
    assert decoded == content
    assert filename.startswith("canvas-wd14-") and filename.endswith(".png")
    assert media_type == "image/png"

    current = _build_wd14_inputs(
        0.35,
        {
            "image", "model", "threshold", "character_threshold",
            "replace_underscore", "trailing_comma", "exclude_tags",
        },
    )
    assert current["character_threshold"] == 0.85
    assert current["exclude_tags"] == ""

    legacy = _build_wd14_inputs(
        0.35,
        {"image", "model", "threshold", "replace_underscore", "trailing_comma"},
    )
    assert "character_threshold" not in legacy
    assert "exclude_tags" not in legacy

    assert _tagger_output_text({"2": {"tags": ["1girl, blue_hair"]}}) == "1girl, blue_hair"
    assert _tagger_output_text({"2": {"text": ["solo", "smile"]}}) == "solo, smile"

    try:
        _decode_tagger_image("not-base64", "broken.jpg")
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("invalid Base64 input was accepted")

    original_workdir = CONFIG.get("comfy_workdir")
    with tempfile.TemporaryDirectory() as temp_dir:
        CONFIG["comfy_workdir"] = temp_dir
        target = Path(temp_dir) / "input" / "CanvasTemp" / "wd14" / "one.png"
        target.parent.mkdir(parents=True)
        target.write_bytes(content)
        _remove_uploaded_tagger_image("CanvasTemp/wd14/one.png")
        assert not target.exists()
    CONFIG["comfy_workdir"] = original_workdir


if __name__ == "__main__":
    test_wd14_bridge_compatibility()
