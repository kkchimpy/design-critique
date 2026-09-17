# LLM Council, but it's for design-critique

A local-first multi-model design review tool inspired by [Karpathy's LLM Council](https://github.com/karpathy/llm-council). Upload a design, let several OpenRouter models critique it, inspect the anonymous peer review, and download a self-contained HTML verdict.

## How it works

1. Stage 0 establishes the screen type, user goal, relevant frameworks, and observable evidence.
2. Stage 1 asks every council model for an independent critique.
3. Stage 2 anonymizes those critiques and asks the models to rank them for specificity and usefulness.
4. Stage 3 asks the chairman model to synthesize a final verdict with a scorecard, prioritized issues, strengths, and next steps.
5. The app places clickable annotations on the uploaded image and can download the complete review as one standalone HTML file.

## Privacy model

This is intended to run on your own computer, not as a hosted shared service.

- You enter your own OpenRouter key in the browser.
- The key is kept in browser `sessionStorage` and sent only to the local review endpoint as `X-API-Key`.
- The backend never writes the key to `.env` or to conversation files.
- Uploaded screenshots and model responses are sent to OpenRouter according to your selected models' policies.
- Conversations are stored locally as JSON files in `data/conversations/` and are ignored by Git. No duplicate Markdown answer files are generated.
- The downloaded HTML verdict contains the screenshot and critique so it can be shared without this app or an API key. It uses system fonts and does not contact a font CDN.

This project is meant to be cloned and run on your own computer. Do not deploy it as a public website.

- The API listens on `127.0.0.1` only, so other devices on your network cannot reach it.
- Conversation files stay in `data/conversations/` and are gitignored. Do not commit that folder.
- Your OpenRouter key stays in the browser; never put it in the repo or a `.env` file.
- Uploaded screenshots are sent to OpenRouter when you run a review. Treat exported HTML files as confidential if the design is.

## Quick start

### Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/)
- An OpenRouter account with credits or an appropriate spending limit

**macOS / Linux:**

```bash
./start.sh
```

**Windows:** `start.sh` is a bash script. Run it from Git Bash or WSL, or use the manual steps below in PowerShell/cmd.

Then open [http://localhost:8001](http://localhost:8001), paste an OpenRouter key, and start a review. No server `.env` file is required.

### Manual start

```bash
uv sync
uv run python -m backend.main
```

## Configure models

Edit `backend/config.py` to choose the council and chairman models available through OpenRouter:

```python
COUNCIL_MODELS = [
    "openai/gpt-5.6-luna",
    "google/gemini-3.7-flash",
    "meta/muse-spark-1.1",
    "qwen/qwen3.8-27b",
]

CHAIRMAN_MODEL = "google/gemini-3.7-flash"
```

For image critiques, choose models that support image input. OpenRouter model IDs and capabilities change over time, so check the model documentation before replacing these defaults.

Only one design or text review runs at a time per backend process; a second concurrent request waits briefly and then returns a "try again shortly" message instead of queuing indefinitely.

## Image handling

- Accepted formats: PNG, JPEG, and WebP.
- Source files are limited to 10 MB.
- Before upload, the browser resizes images to a maximum 2400px longest edge.
- The browser converts the image to WebP at 88% quality when that produces a smaller payload; otherwise it keeps the original.
- The optimized image is what gets sent to OpenRouter and stored in the local conversation JSON.

## Exporting a review

After a design verdict is ready, choose **Download HTML verdict**. The generated file contains inline CSS, JavaScript, the uploaded image, annotations, and the sanitized Markdown verdict. It can be opened locally or uploaded to any static host.

## Design system

`design-system/tokens.css` is the single canonical source for the shared palette, spacing, radii, and layout primitives used by the local UI and the exported verdict HTML. The backend reads this file directly (`backend/config.py`'s `TOKENS_CSS`) instead of keeping a second copy, so there is only ever one place to edit.

When the visual language originates from a Figma file, treat those Figma values as authoritative and update `design-system/tokens.css` to match — never hand-edit a token value only in app CSS or a backend template. See `design-system/README.md` for the full rule set.

## Project structure

| Layer | Location |
| --- | --- |
| FastAPI backend | `backend/` |
| Council orchestration | `backend/council.py` |
| OpenRouter client | `backend/openrouter.py` |
| HTML export | `backend/export.py` and `backend/templates/` |
| Design tokens | `design-system/tokens.css` |
| Vanilla UI | `vanilla/` (served by the backend, no build step) |
| Design principles | `skills/design-principles/` |
| Local conversation data | `data/conversations/` |

## Checks

```bash
uv run python -m compileall -q backend
```

```bash
uv run python -m unittest discover -s tests -v
```

## License

[MIT](LICENSE). This project is inspired by [Karpathy's LLM Council](https://github.com/karpathy/llm-council), which is provided as-is without an explicit license.
