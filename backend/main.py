"""FastAPI backend for LLM Council."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Any, Optional
import uuid
import json
import asyncio
import base64
import binascii
import re
import httpx

from . import config
from . import storage
from .openrouter import close_client, warn_if_models_unavailable
from .export import render_verdict_html
from .build_gallery import parse_scorecard_metrics
from .markdown_renderer import (
    render_conversation,
    render_response,
    render_stage1_results,
    render_stage2_results,
)
from .config import (
    COUNCIL_MODELS,
    MAX_API_KEY_LENGTH,
    MAX_CONTENT_LENGTH,
    MAX_IMAGE_BYTES,
    MAX_REQUEST_BYTES,
    _request_api_key,
)
from .local_auth import get_app_token, rotate_app_token, token_matches
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

_WORKFLOW_SLOTS = asyncio.Semaphore(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage shared resources for the app's lifetime."""
    rotate_app_token()
    # Best-effort check so a stale model ID in config.py surfaces as a clear
    # startup warning instead of a confusing "all council members failed"
    # error after a user's first review attempt.
    asyncio.create_task(warn_if_models_unavailable())
    yield
    # Close the shared HTTP client and its connection pool on shutdown.
    await close_client()


app = FastAPI(title="LLM Council API", lifespan=lifespan)

# 10 MB source images plus JSON/data-URL overhead.
_DATA_URL_RE = re.compile(r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$")

_LOCAL_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
_TOKEN_EXEMPT_PATHS = {"/", "/health", "/api/session"}

# Enable CORS for the local Vite/React dev servers only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_LOCAL_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-API-Key", "X-App-Token"],
)


@app.middleware("http")
async def require_local_session(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in _TOKEN_EXEMPT_PATHS:
        return await call_next(request)
    if request.url.path.startswith("/api/") and not token_matches(request.headers.get("x-app-token")):
        return JSONResponse({"detail": "Missing or invalid local session."}, status_code=401)
    return await call_next(request)


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
    # Content-Length header. FastAPI can still parse this cached body.
    if request.method in {"POST", "PUT", "PATCH"}:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_REQUEST_BYTES:
                return JSONResponse({"detail": "Request too large."}, status_code=413)
        request._body = bytes(body)
    return await call_next(request)


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    pass


class SendMessageRequest(BaseModel):
    """Request to send a message in a conversation.

    When ``image`` is provided (a data URL), the council runs in design-critique
    mode instead of the regular Q&A flow. The council models are configured in
    ``backend/config.py``.
    """
    content: str = Field(default="", max_length=MAX_CONTENT_LENGTH)
    image: Optional[str] = Field(default=None, max_length=MAX_REQUEST_BYTES)

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
        except (ValueError, TypeError, binascii.Error):
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
    messages: List[Dict[str, Any]]


@app.get("/")
async def root():
    return {"status": "ok", "service": "LLM Council API"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/session")
async def local_session(request: Request):
    """Issue the in-memory token the local UI must send on later /api calls."""
    host = (request.client.host if request.client else "") or ""
    origin = request.headers.get("origin")
    if host not in {"127.0.0.1", "::1", "localhost"} or (origin and origin not in _LOCAL_ORIGINS):
        raise HTTPException(status_code=403, detail="Local session is only available on this computer.")
    return {"token": get_app_token()}


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations():
    """List all conversations (metadata only)."""
    return storage.list_conversations()


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(request: CreateConversationRequest):
    """Create a new conversation."""
    conversation_id = str(uuid.uuid4())
    conversation = storage.create_conversation(conversation_id)
    return conversation


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    """Get a specific conversation with all its messages."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return render_conversation(conversation)


@app.delete("/api/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str):
    """Delete a conversation and all its stored data."""
    deleted = storage.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")


@app.post("/api/reset")
async def reset_app_data():
    """Delete all saved conversations and generated answer artifacts."""
    storage.reset_all_data()
    return {"status": "ok"}


def slug_from_title(title: str, conv_id: str) -> str:
    """Generate a clean slug from title and short UUID prefix."""
    clean = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    short_hash = (conv_id or "")[:8]
    if clean and clean not in ("design-critique", "new-conversation", "critique"):
        return f"{clean[:32]}-{short_hash}" if short_hash else clean[:40]
    return f"design-critique-{short_hash}" if short_hash else "design-critique"


@app.post("/api/conversations/{conversation_id}/export")
async def export_verdict(conversation_id: str):
    """Return the latest design verdict as a standalone downloadable HTML file."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    verdict = storage.get_latest_design_verdict(conversation_id)
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
    )

    slug = slug_from_title(verdict.get("title", ""), conversation_id)
    filename = f"{slug}.html"
    return Response(
        content=html_content,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/conversations/{conversation_id}/publish")
async def publish_verdict(conversation_id: str):
    """Publish the standalone verdict HTML and its metadata to Supabase."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    verdict = storage.get_latest_design_verdict(conversation_id)
    if verdict is None:
        raise HTTPException(
            status_code=400,
            detail="No design critique verdict found in this conversation.",
        )

    # 1. Render standalone HTML verdict
    html_content = render_verdict_html(
        title=verdict["title"],
        context=verdict["context"],
        verdict_markdown=verdict["verdict"],
        image_data_url=verdict.get("image"),
        council_members=verdict["council"],
        annotations=verdict.get("annotations"),
    )

    slug = slug_from_title(verdict.get("title", ""), conversation_id)
    file_path = f"{slug}.html"
    public_html_url = f"{config.SUPABASE_URL}/storage/v1/object/public/{config.SUPABASE_BUCKET}/{file_path}"

    headers = {
        "apikey": config.SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {config.SUPABASE_ANON_KEY}",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 2. Upload HTML file to Supabase Storage
        upload_url = f"{config.SUPABASE_URL}/storage/v1/object/{config.SUPABASE_BUCKET}/{file_path}"
        upload_resp = await client.post(
            upload_url,
            headers={
                **headers,
                "Content-Type": "text/html",
                "x-upsert": "true",
            },
            content=html_content.encode("utf-8"),
        )
        if upload_resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=502,
                detail=f"Storage upload failed ({upload_resp.status_code}): {upload_resp.text}",
            )

        # 3. Calculate metrics for the gallery database
        avg_score, _ = parse_scorecard_metrics(verdict.get("verdict", ""))
        annotations = verdict.get("annotations") or []
        crit_count = sum(
            1
            for a in annotations
            if str(a.get("severity", "")).strip().lower() in ("1", "crit", "critical")
        )
        high_count = sum(
            1
            for a in annotations
            if str(a.get("severity", "")).strip().lower() in ("2", "high")
        )
        med_count = sum(
            1
            for a in annotations
            if str(a.get("severity", "")).strip().lower() in ("3", "med", "medium")
        )

        # 4. Upsert row into verdicts table
        db_url = f"{config.SUPABASE_URL}/rest/v1/verdicts"
        db_payload = {
            "conversation_id": conversation_id,
            "slug": slug,
            "title": verdict.get("title") or "Design Critique",
            "context": verdict.get("context") or "",
            "image_url": verdict.get("image") or "",
            "html_url": public_html_url,
            "council": verdict.get("council") or [],
            "annotations": annotations,
            "avg_score": avg_score,
            "crit_count": crit_count,
            "high_count": high_count,
            "med_count": med_count,
        }
        db_resp = await client.post(
            db_url,
            headers={
                **headers,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            json=db_payload,
        )
        if db_resp.status_code not in (200, 201):
            # Non-blocking warning/fallback if table insert has schema mismatch but storage succeeded
            pass

    public_gallery_url = f"{config.PUBLIC_GALLERY_BASE_URL}/verdicts/{slug}.html"

    return {
        "status": "published",
        "url": public_gallery_url,
        "storage_url": public_html_url,
        "slug": slug,
    }


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
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if x_api_key and len(x_api_key) > MAX_API_KEY_LENGTH:
        raise HTTPException(status_code=400, detail="API key is too long.")
    if not x_api_key or not x_api_key.strip():
        raise HTTPException(status_code=400, detail="An OpenRouter API key is required.")

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    # Design-critique mode activates ONLY when an image is attached
    design_mode = bool(request.image)
    council_models = COUNCIL_MODELS
    metadata = {
        "mode": "design" if design_mode else "text",
        "council_models": list(council_models),
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
        title_task = None
        assistant_saved = False
        slot_acquired = False
        try:
            await asyncio.wait_for(_WORKFLOW_SLOTS.acquire(), timeout=5.0)
            slot_acquired = True
            # Add user message
            storage.add_user_message(conversation_id, request.content, image=request.image)

            # Start title generation in parallel (don't await yet)
            if is_first_message and not design_mode:
                title_task = asyncio.create_task(generate_conversation_title(request.content))

            # Stage 1: Collect responses / critiques
            stage0_result = {}
            if design_mode:
                yield f"data: {json.dumps({'type': 'stage0_start'})}\n\n"
                stage0_result = await stage0_ground_truth(request.image, request.content)
                metadata["stage0"] = stage0_result
                yield f"data: {json.dumps({'type': 'stage0_complete', 'data': stage0_result})}\n\n"
                if is_first_message:
                    title_task = asyncio.create_task(
                        generate_design_title(request.content, stage0_result=stage0_result)
                    )

            yield f"data: {json.dumps({'type': 'stage1_start', 'mode': 'design' if design_mode else 'text'})}\n\n"
            if design_mode:
                stage1_results = await stage1_collect_design_feedback(
                    request.image,
                    request.content,
                    models=council_models,
                    stage0_result=stage0_result,
                )
            else:
                stage1_results = await stage1_collect_responses(request.content, models=council_models)
            rendered_stage1_results = render_stage1_results(stage1_results)
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
                storage.add_assistant_message(
                    conversation_id,
                    [],
                    [],
                    stage3_result,
                    mode="design" if design_mode else "text",
                    metadata=metadata,
                )
                assistant_saved = True
                if title_task and not title_task.done():
                    title_task.cancel()
                yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata})}\n\n"
                return

            # Stage 2: Collect rankings
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            if design_mode:
                stage2_results, label_to_model = await stage2_collect_design_rankings(request.content, stage1_results, models=council_models)
            else:
                stage2_results, label_to_model = await stage2_collect_rankings(request.content, stage1_results, models=council_models)
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            metadata.update({
                "label_to_model": label_to_model,
                "aggregate_rankings": aggregate_rankings,
            })
            rendered_stage2_results = render_stage2_results(stage2_results, label_to_model)
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': rendered_stage2_results, 'metadata': metadata})}\n\n"

            # Stage 3: Synthesize final answer / verdict
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            if design_mode:
                stage3_result = await stage3_synthesize_design_verdict(request.image, request.content, stage1_results, stage2_results)
            else:
                stage3_result = await stage3_synthesize_final(request.content, stage1_results, stage2_results)
            rendered_stage3_result = render_response(stage3_result, sectioned=design_mode)
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': rendered_stage3_result})}\n\n"

            # Design mode: localize the verdict onto the image as clickable pins.
            if design_mode:
                yield f"data: {json.dumps({'type': 'annotations_start'})}\n\n"
                annotations = await extract_design_annotations(
                    request.image, request.content, stage3_result.get("response", "")
                )
                metadata["annotations"] = annotations
                yield f"data: {json.dumps({'type': 'annotations_complete', 'data': annotations})}\n\n"

            # Wait for title generation if it was started
            if title_task:
                title = await title_task
                storage.update_conversation_title(conversation_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            # Save complete assistant message
            storage.add_assistant_message(
                conversation_id,
                stage1_results,
                stage2_results,
                stage3_result,
                mode="design" if design_mode else "text",
                annotations=annotations,
                metadata=metadata,
            )
            assistant_saved = True

            # Send completion event
            yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata})}\n\n"

        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Another review is already running. Please try again shortly.'})}\n\n"
        except Exception as e:
            if title_task and not title_task.done():
                title_task.cancel()

            metadata["error"] = "council_failed"
            if not assistant_saved:
                stage3_result = {
                    "model": "error",
                    "response": "The council stopped before completing this request. You can retry it from the conversation.",
                }
                try:
                    storage.add_assistant_message(
                        conversation_id,
                        stage1_results,
                        stage2_results,
                        stage3_result,
                        mode="design" if design_mode else "text",
                        annotations=annotations,
                        metadata=metadata,
                    )
                except Exception as save_error:
                    print(f"Failed to persist council error: {save_error}")

            import traceback
            traceback.print_exc()
            print(f"Council request failed: {type(e).__name__}: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'Council error: {type(e).__name__} - {e}'})}\n\n"
        finally:
            if slot_acquired:
                _WORKFLOW_SLOTS.release()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
