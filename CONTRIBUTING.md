# Contributing

Contributions are welcome. Keep the APP-only security boundary intact:

- do not add public web or Funnel defaults;
- do not hard-code machine paths, Tailnet names, IPs or credentials;
- do not commit models, generated images or runtime data;
- preserve backward-compatible prompt backup formats;
- add or update tests for Gateway and prompt-store changes.

Before submitting a pull request:

```powershell
cd android-app
npm ci
npm test
npm run build

cd ..\gateway
python -m pytest tests
```

Describe any required ComfyUI custom nodes and model licenses in the pull request.
