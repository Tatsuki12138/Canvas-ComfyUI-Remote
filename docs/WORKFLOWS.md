# Workflow integration

For the complete Chinese guide, including a beginner-safe procedure, parameter reference, LoRA stack notes, custom-node security guidance and a prompt for AI assistants, see [自定义工作流封装指南.md](%E8%87%AA%E5%AE%9A%E4%B9%89%E5%B7%A5%E4%BD%9C%E6%B5%81%E5%B0%81%E8%A3%85%E6%8C%87%E5%8D%97.md). A machine-readable definition schema is available in [workflow-profile.schema.json](workflow-profile.schema.json).

Canvas sends API-format workflow JSON to ComfyUI. A workflow definition combines a template path with a `node_map` describing which node input receives each APP parameter.

## Export a template

In ComfyUI, use **Save (API Format)** or enable developer options and export an API-format workflow. UI-format workflow JSON is not accepted by the Gateway.

Copy the file into `gateway/workflows/`, then add a definition to the user's `%APPDATA%\CanvasGateway\config.json`:

```json
{
  "id": "my_workflow",
  "label": "My Workflow",
  "path": "workflows/my_workflow.json",
  "model_kind": "checkpoint",
  "features": ["txt2img", "hires"],
  "defaults": {
    "width": 1024,
    "height": 1024,
    "steps": 28,
    "cfg": 6.0,
    "seed": -1
  },
  "node_map": {
    "positive": {"node": "7", "input": "text"},
    "negative": {"node": "8", "input": "text"},
    "width": {"node": "9", "input": "width"},
    "height": {"node": "9", "input": "height"},
    "steps": {"node": "10", "input": "steps"},
    "cfg": {"node": "10", "input": "cfg"},
    "seed": {"node": "10", "input": "seed"},
    "filename_prefix": {"node": "12", "input": "filename_prefix"},
    "base_model": {"node": "2", "input": "ckpt_name"}
  }
}
```

Supported mapping keys include `positive`, `negative`, `width`, `height`, `steps`, `cfg`, `seed`, `sampler_name`, `scheduler`, `hires_steps`, `hires_cfg`, `hires_denoise`, `hires_sampler_name`, `hires_scheduler`, `kernel_size`, `filename_prefix`, `lora_stack` and `base_model`.

Restart the Gateway after changing workflow definitions. Validate the original workflow in ComfyUI before diagnosing the APP integration.
