from typing import List

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    image_b64: str = Field(..., description="Canvas image as base64 data URL")
    top_k: int = Field(default=5, ge=1, le=10)


class PredictionItem(BaseModel):
    label: str
    prob: float


class PredictResponse(BaseModel):
    predictions: List[PredictionItem]
    is_blank: bool
    guessed: bool
    latency_ms: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


class ClassesResponse(BaseModel):
    classes: List[str]


class EnhanceRequest(BaseModel):
    image_b64: str = Field(..., description="Canvas image as base64 data URL")
    label: str = Field(default="", max_length=40)
    label_name: str = Field(default="", max_length=40)


class EnhanceStartResponse(BaseModel):
    task_id: str


class EnhanceStatusResponse(BaseModel):
    status: str
    progress: int = 0
    image_url: str | None = None
    error: str | None = None
