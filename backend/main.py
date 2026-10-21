import mimetypes

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import INDEX_HTML, STATIC_DIR
from .enhance import EnhanceError, abandon_task, get_image, poll_task, start_task

# Windows' MIME registry does not always know .webp, and StaticFiles uses this
# table. Registering it keeps the still frame and animated WebP decodable.
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("video/mp4", ".mp4")
from .inference import PredictorService
from .schemas import (
    ClassesResponse,
    EnhanceRequest,
    EnhanceStartResponse,
    EnhanceStatusResponse,
    HealthResponse,
    PredictRequest,
    PredictResponse,
)

app = FastAPI(title="QuickDraw Real-Time Guessing", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

predictor = PredictorService()
predictor.load_model()


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    if not INDEX_HTML.exists():
        raise HTTPException(status_code=404, detail="frontend/index.html not found")
    return FileResponse(INDEX_HTML)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_loaded=predictor.model_loaded)


@app.get("/api/classes", response_model=ClassesResponse)
def classes() -> ClassesResponse:
    return ClassesResponse(classes=predictor.get_classes())


@app.post("/api/predict", response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    if not predictor.model_loaded:
        raise HTTPException(
            status_code=503,
            detail="Model is not loaded. Train model first: python ml/train.py",
        )

    try:
        result = predictor.predict(payload.image_b64, payload.top_k)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unexpected server error: {exc}") from exc

    return PredictResponse(**result)


@app.post("/api/enhance", response_model=EnhanceStartResponse)
def enhance(payload: EnhanceRequest) -> EnhanceStartResponse:
    try:
        task_id = start_task(payload.image_b64, payload.label, payload.label_name)
    except EnhanceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI 美化任务创建失败：{exc}") from exc
    return EnhanceStartResponse(task_id=task_id)


@app.get("/api/enhance/{task_id}", response_model=EnhanceStatusResponse)
def enhance_status(task_id: str) -> EnhanceStatusResponse:
    try:
        result = poll_task(task_id)
    except EnhanceError as exc:
        status_code = 404 if "不存在" in str(exc) else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    return EnhanceStatusResponse(**result)


@app.delete("/api/enhance/{task_id}", status_code=204)
def cancel_enhance(task_id: str) -> Response:
    abandon_task(task_id)
    return Response(status_code=204)


@app.get("/api/enhance/{task_id}/image")
def enhance_image(task_id: str) -> Response:
    try:
        image, content_type = get_image(task_id)
    except EnhanceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(
        content=image,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )
