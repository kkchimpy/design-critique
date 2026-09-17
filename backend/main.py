"""FastAPI backend for LLM Council."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse, FileResponse
from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Any, Optional
from pathlib import Path as _Path
import uuid
import json
import asyncio
import base64
import logging
import re

from . import config
from . import storage
from .storage import slug_from_title
from .openrouter import close_client
from .export import render_verdict_html
from .markdown_renderer import (
    render_conversation,
    render_ranking,
    render_response,
)
from .config import (
    COUNCIL_MODELS,
    MAX_API_KEY_LENGTH,
    MAX_CONTENT_LENGTH,
    MAX_IMAGE_BYTES,
    MAX_REQUEST_BYTES,
    MAX_CUSTOM_CONTEXT_LENGTH,
    _request_api_key,
)
from .council import (
    generate_conversation_title,
    generate_design_title,
    stage1_collect_responses,
    stage2_collect_rankings,
    stage3_synthesize_final,
    calculate_aggregate_rankings,
    stage1_collect_design_feedback,
    stage2_collect_design_rankings,
    stage3_synthesize_design_verdict,
    extract_design_annotations,
    stage0_ground_truth,
)

logger = logging.getLogger(__name__)

# Only one review runs at a time per backend process; a second concurrent
# request waits briefly and then returns "try again shortly" (see TimeoutError
# below). Matches the documented single-review behavior in README.md.
_WORKFLOW_LOCK = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage shared resources for the app's lifetime."""
    yield
    # Close the shared HTTP client and its connection pool on shutdown.
    await close_client()


app = FastAPI(title="LLM Council API", lifespan=lifespan)

# 10 MB source images plus JSON/data-URL overhead.
_DATA_URL_RE = re.compile(r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$")

@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                return JSONResponse({"detail": "Request too large."}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Invalid content length."}, status_code=400)
    # Enforce the limit while reading, including requests without a
    # Content-Length header. await request.body() caches internally, so
    # downstream JSON parsing still works.
    if request.method in {"POST", "PUT", "PATCH"}:
        body = await request.body()
        if len(body) > MAX_REQUEST_BYTES:
            return JSONResponse({"detail": "Request too large."}, status_code=413)
    return await call_next(request)


class SendMessageRequest(BaseModel):
    """Request to send a message in a conversation.

    When ``image`` is provided (a data URL), the council runs in design-critique
    mode instead of the regular Q&A flow. The council models are configured in
    ``backend/config.py``.
    """
    content: str = Field(default="", max_length=MAX_CONTENT_LENGTH)
    image: Optional[str] = Field(default=None, max_length=MAX_REQUEST_BYTES)
    custom_context: str = Field(default="", max_length=MAX_CUSTOM_CONTEXT_LENGTH)

    @field_validator("image")
    @classmethod
    def image_must_be_data_url(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        match = _DATA_URL_RE.fullmatch(value)
        if not match:
            raise ValueError("image must be a PNG, JPEG, or WebP data URL")
        mime, encoded = match.groups()
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError):
            raise ValueError("image data is not valid base64")
        if len(decoded) > MAX_IMAGE_BYTES:
            raise ValueError("image exceeds the 10 MB limit")
        signatures = {
            "image/png": decoded.startswith(b"\x89PNG\r\n\x1a\n"),
            "image/jpeg": decoded.startswith(b"\xff\xd8\xff"),
            "image/webp": len(decoded) >= 12 and decoded[:4] == b"RIFF" and decoded[8:12] == b"WEBP",
        }
        if not signatures.get(mime, False):
            raise ValueError("image data does not match its declared type")
        return value


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    message_count: int
    mode: str = "text"


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    app_name: str = ""
    messages: List[Dict[str, Any]]


@app.get("/")
async def root():
    """Serve the vanilla local UI; fall back to JSON when it is absent."""
    index = _Path(__file__).resolve().parent.parent / "vanilla" / "index.html"
    if index.is_file():
        # Never cache the shell: it pins versioned asset URLs.
        return FileResponse(index, media_type="text/html", headers={"Cache-Control": "no-store"})
    return {"status": "ok", "service": "LLM Council API"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations():
    """List all conversations (metadata only)."""
    # Storage is blocking file I/O; keep it off the event loop.
    return await asyncio.to_thread(storage.list_conversations)


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation():
    """Create a new conversation."""
    conversation_id = str(uuid.uuid4())
    conversation = await asyncio.to_thread(storage.create_conversation, conversation_id)
    return conversation


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    """Get a specific conversation with all its messages."""
    conversation = await asyncio.to_thread(storage.get_conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return render_conversation(conversation)


@app.delete("/api/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str):
    """Delete a conversation and all its stored data."""
    deleted = await asyncio.to_thread(storage.delete_conversation, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")


@app.patch("/api/conversations/{conversation_id}/app-name")
async def update_app_name(conversation_id: str, body: Dict[str, Any]):
    """Set the app/product name that will accompany a published verdict."""
    conversation = await asyncio.to_thread(storage.get_conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    app_name = str(body.get("app_name", "")).strip()[:120]
    await asyncio.to_thread(storage.update_conversation_app_name, conversation_id, app_name)
    return {"app_name": app_name}


@app.post("/api/reset")
async def reset_app_data(request: Request):
    """Delete all saved conversations and generated answer artifacts."""
    # New clients should send {"confirm": true}. The current frontend sends
    # no body, so only reject an explicit confirm:false to stay compatible.
    try:
        payload = await request.json()
    except Exception:
        payload = None
    if isinstance(payload, dict) and "confirm" in payload and payload.get("confirm") is not True:
        raise HTTPException(status_code=400, detail="Reset requires {\"confirm\": true}.")
    await asyncio.to_thread(storage.reset_all_data)
    return {"status": "ok"}


@app.post("/api/conversations/{conversation_id}/export")
async def export_verdict(conversation_id: str):
    """Return the latest design verdict as a standalone downloadable HTML file."""
    conversation = await asyncio.to_thread(storage.get_conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    verdict = await asyncio.to_thread(storage.get_latest_design_verdict, conversation_id)
    if verdict is None:
        raise HTTPException(
            status_code=400,
            detail="No design critique verdict found in this conversation.",
        )

    html_content = render_verdict_html(
        title=verdict["title"],
        context=verdict["context"],
        verdict_markdown=verdict["verdict"],
        image_data_url=verdict.get("image"),
        council_members=verdict["council"],
        annotations=verdict.get("annotations"),
        app_name=verdict.get("app_name", ""),
    )

    slug = slug_from_title(verdict.get("title", ""), conversation_id)
    filename = f"{slug}.html"
    return Response(
        content=html_content,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(
    conversation_id: str,
    request: SendMessageRequest,
    x_api_key: Optional[str] = Header(None),
):
    """
    Send a message and stream the 3-stage council process.
    Returns Server-Sent Events as each stage completes.
    """
    # Check if conversation exists
    conversation = await asyncio.to_thread(storage.get_conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if x_api_key and len(x_api_key) > MAX_API_KEY_LENGTH:
        raise HTTPException(status_code=400, detail="API key is too long.")
    if not x_api_key or not x_api_key.strip():
        raise HTTPException(status_code=400, detail="An OpenRouter API key is required.")

    # Design-critique mode activates ONLY when an image is attached
    design_mode = bool(request.image)
    # Council lineup is fixed in backend/config.py — no per-request overrides.
    council_models = list(COUNCIL_MODELS)
    chairman_model = config.CHAIRMAN_MODEL
    # Live ref: per-model failure reasons accumulate here through the run and
    # are included in every metadata payload below (stage events + save).
    model_errors: Dict[str, str] = {}
    metadata = {
        "mode": "design" if design_mode else "text",
        "council_models": list(council_models),
        "chairman_model": chairman_model,
        "model_errors": model_errors,
    }

    async def event_generator():
        # StreamingResponse may run this generator after the request context is
        # gone, so re-bind the OpenRouter key here instead of in the endpoint.
        if x_api_key:
            _request_api_key.set(x_api_key.strip())

        stage1_results = []
        stage2_results = []
        stage3_result = {
            "model": "error",
            "response": "The council did not finish this request.",
        }
        annotations = None
        pending_title: Optional[str] = None
        assistant_saved = False
        lock_acquired = False
        try:
            await asyncio.wait_for(_WORKFLOW_LOCK.acquire(), timeout=5.0)
            lock_acquired = True
            conversation = await asyncio.to_thread(storage.get_conversation, conversation_id)
            if conversation is None:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Conversation not found'})}\n\n"
                return
            is_first_message = len(conversation["messages"]) == 0

            # Add user message
            await asyncio.to_thread(
                storage.add_user_message, conversation_id, request.content, request.image
            )

            # Titles are local string ops (microseconds); compute inline instead
            # of spawning tasks that need cancelling on every error path.
            if is_first_message and not design_mode:
                pending_title = generate_conversation_title(request.content)

            # Stage 1: Collect responses / critiques
            stage0_result = {}
            if design_mode:
                yield f"data: {json.dumps({'type': 'stage0_start'})}\n\n"
                stage0_result = await stage0_ground_truth(request.image, request.content, chairman_model=chairman_model, custom_context=request.custom_context, errors=model_errors)
                metadata["stage0"] = stage0_result
                yield f"data: {json.dumps({'type': 'stage0_complete', 'data': stage0_result})}\n\n"
                if is_first_message:
                    pending_title = generate_design_title(
                        request.content, stage0_result=stage0_result
                    )

            yield f"data: {json.dumps({'type': 'stage1_start', 'mode': 'design' if design_mode else 'text'})}\n\n"
            if design_mode:
                stage1_results = await stage1_collect_design_feedback(
                    request.image,
                    request.content,
                    models=council_models,
                    stage0_result=stage0_result,
                    chairman_model=chairman_model,
                    custom_context=request.custom_context,
                    errors=model_errors,
                )
            else:
                stage1_results = await stage1_collect_responses(
                    request.content,
                    models=council_models,
                    custom_context=request.custom_context,
                    errors=model_errors,
                )
            rendered_stage1_results = [render_response(item) for item in stage1_results]
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': rendered_stage1_results})}\n\n"

            if not stage1_results:
                # x_api_key is already validated as non-empty before the stream
                # starts, so a failure here always means every council member
                # rejected the request (bad model IDs, no credits, etc.).
                stage3_result = {
                    "model": "error",
                    "response": (
                        "All configured council members failed to respond. Check that "
                        "the key has credits and that the model IDs in backend/config.py "
                        "still exist on OpenRouter."
                    ),
                }
                yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"
                await asyncio.to_thread(
                    storage.add_assistant_message,
                    conversation_id,
                    [],
                    [],
                    stage3_result,
                    "design" if design_mode else "text",
                    None,
                    metadata,
                )
                assistant_saved = True
                yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata})}\n\n"
                return

            # Stage 2: Collect rankings
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            if design_mode:
                stage2_results, label_to_model = await stage2_collect_design_rankings(request.content, stage1_results, models=council_models, custom_context=request.custom_context, errors=model_errors)
            else:
                stage2_results, label_to_model = await stage2_collect_rankings(request.content, stage1_results, models=council_models, errors=model_errors)
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            metadata.update({
                "label_to_model": label_to_model,
                "aggregate_rankings": aggregate_rankings,
            })
            rendered_stage2_results = [render_ranking(item, label_to_model) for item in stage2_results]
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': rendered_stage2_results, 'metadata': metadata})}\n\n"

            # Stage 3: Synthesize final answer / verdict
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            if design_mode:
                stage3_result = await stage3_synthesize_design_verdict(request.image, request.content, stage1_results, stage2_results, chairman_model=chairman_model, custom_context=request.custom_context, errors=model_errors)
            else:
                stage3_result = await stage3_synthesize_final(
                    request.content,
                    stage1_results,
                    stage2_results,
                    chairman_model=chairman_model,
                    custom_context=request.custom_context,
                    errors=model_errors,
                )
            rendered_stage3_result = render_response(stage3_result, sectioned=design_mode)
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': rendered_stage3_result})}\n\n"

            # Design mode: localize the verdict onto the image as clickable pins.
            if design_mode:
                yield f"data: {json.dumps({'type': 'annotations_start'})}\n\n"
                annotations = await extract_design_annotations(
                    request.image,
                    request.content,
                    stage3_result.get("response", ""),
                    chairman_model=chairman_model,
                    custom_context=request.custom_context,
                    errors=model_errors,
                )
                metadata["annotations"] = annotations
                yield f"data: {json.dumps({'type': 'annotations_complete', 'data': annotations})}\n\n"

            # Wait for title generation if it was started
            if pending_title:
                await asyncio.to_thread(
                    storage.update_conversation_title, conversation_id, pending_title
                )
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': pending_title}})}\n\n"

            # Save complete assistant message
            await asyncio.to_thread(
                storage.add_assistant_message,
                conversation_id,
                stage1_results,
                stage2_results,
                stage3_result,
                "design" if design_mode else "text",
                annotations,
                metadata,
            )
            assistant_saved = True

            # Send completion event
            yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata})}\n\n"

        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Another review is already running. Please try again shortly.'})}\n\n"
        except Exception as e:
            metadata["error"] = "council_failed"
            if not assistant_saved:
                stage3_result = {
                    "model": "error",
                    "response": "The council stopped before completing this request. You can retry it from the conversation.",
                }
                try:
                    await asyncio.to_thread(
                        storage.add_assistant_message,
                        conversation_id,
                        stage1_results,
                        stage2_results,
                        stage3_result,
                        "design" if design_mode else "text",
                        annotations,
                        metadata,
                    )
                except Exception as save_error:
                    logger.warning("Failed to persist council error: %s", save_error)

            logger.exception("Council request failed: %s: %s", type(e).__name__, e)
            yield f"data: {json.dumps({'type': 'error', 'message': f'Council error: {type(e).__name__} - {e}'})}\n\n"
        finally:
            if lock_acquired:
                _WORKFLOW_LOCK.release()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


# Vanilla local UI assets (allowlist; registered last so /api/* routes win).
# tokens.css is served from the canonical design-system source (single source
# of truth per design-system/README.md), never copied into vanilla/.
_VANILLA_ASSETS = {
    "styles.css": ("vanilla", "text/css"),
    "app.js": ("vanilla", "text/javascript"),
    "tokens.css": ("design-system", "text/css"),
}


@app.get("/{fname}", include_in_schema=False)
async def vanilla_asset(fname: str):
    entry = _VANILLA_ASSETS.get(fname)
    if entry is None:
        raise HTTPException(status_code=404, detail="Not found")
    subdir, media_type = entry
    path = _Path(__file__).resolve().parent.parent / subdir / fname
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type=media_type)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
