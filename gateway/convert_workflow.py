from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path
from typing import Any


def convert(workflow: dict[str, Any], object_info: dict[str, Any]) -> dict[str, Any]:
    links = {int(link[0]): link for link in workflow.get("links", [])}
    prompt: dict[str, Any] = {}

    for node in workflow.get("nodes", []):
        node_type = node.get("type")
        if node_type not in object_info or node.get("mode", 0) in (2, 4):
            continue

        definition = object_info[node_type]
        valid_names = set(definition.get("input", {}).get("required", {}))
        valid_names.update(definition.get("input", {}).get("optional", {}))
        widget_values = iter(node.get("widgets_values", []))
        inputs: dict[str, Any] = {}

        for graph_input in node.get("inputs", []):
            name = graph_input.get("name")
            link_id = graph_input.get("link")
            if link_id is not None:
                link = links[int(link_id)]
                if name in valid_names:
                    inputs[name] = [str(link[1]), int(link[2])]
                continue

            if graph_input.get("widget") is not None:
                try:
                    value = next(widget_values)
                except StopIteration:
                    continue
                if name in valid_names:
                    inputs[name] = value

        prompt[str(node["id"])] = {
            "inputs": inputs,
            "class_type": node_type,
            "_meta": {"title": node.get("title") or node_type},
        }

    return prompt


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert a ComfyUI canvas workflow to API format")
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--server", default="http://127.0.0.1:8188")
    args = parser.parse_args()

    with args.source.open("r", encoding="utf-8") as handle:
        workflow = json.load(handle)
    with urllib.request.urlopen(f"{args.server.rstrip('/')}/object_info", timeout=60) as response:
        object_info = json.load(response)

    prompt = convert(workflow, object_info)
    args.destination.write_text(json.dumps(prompt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(prompt)} API nodes to {args.destination}")


if __name__ == "__main__":
    main()
