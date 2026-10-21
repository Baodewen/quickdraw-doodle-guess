"""Server-side proxy for the XAIS sketch beautification service.

The bearer token is read from ``XAIS_TOKEN`` or ``backend/.xais-token`` and is
never sent to the browser. The upstream service is asynchronous:

    upload reference image -> create task -> poll -> fetch result image

Only one task may be pending at a time, which keeps an accidental double click
from spending credits twice.
"""

from __future__ import annotations

import base64
import binascii
import io
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

XAIS_BASE = os.environ.get("XAIS_BASE", "").rstrip("/")
XAIS_MODEL = os.environ.get("XAIS_MODEL", "")
TOKEN_FILE = Path(__file__).with_name(".xais-token")

REFERENCE_SIZE = 1024
MAX_REFERENCE_BYTES = 6_000_000
TASK_TIMEOUT_SECONDS = 240
TASK_TTL_SECONDS = 30 * 60
MAX_TASKS = 12


class EnhanceError(RuntimeError):
    """A user-facing error raised by the beautification proxy."""


@dataclass
class TaskRecord:
    id: str
    created_at: float
    label: str = ""
    label_name: str = ""
    status: str = "pending"
    progress: int = 0
    attachment: str | None = None
    image: bytes | None = None
    content_type: str = "image/jpeg"
    error: str | None = None


_tasks: dict[str, TaskRecord] = {}
_lock = threading.RLock()
_starting = False


def _token() -> str:
    token = os.environ.get("XAIS_TOKEN", "").strip()
    if token:
        return token
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if token:
            return token
    raise EnhanceError("AI 美化服务尚未配置，请设置 XAIS_TOKEN 或 backend/.xais-token。")


def _auth_headers() -> dict[str, str]:
    return {"authorization": f"Bearer {_token()}"}


def _request(url: str, *, method: str = "GET", body: dict | None = None,
             headers: dict[str, str] | None = None, timeout: int = 30) -> tuple[bytes, str]:
    data = None
    request_headers = {"accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        request_headers["content-type"] = "application/json"
    request_headers.update(headers or {})
    request = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read(), response.headers.get("content-type", "")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace").strip()[:300]
        raise EnhanceError(f"AI 美化服务请求失败（HTTP {exc.code}）：{detail or '无响应内容'}") from exc
    except urllib.error.URLError as exc:
        raise EnhanceError(f"无法连接 AI 美化服务：{exc.reason}") from exc
    except TimeoutError as exc:
        raise EnhanceError("AI 美化服务响应超时。") from exc


def _json_request(url: str, **kwargs) -> dict:
    raw, _ = _request(url, **kwargs)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EnhanceError("AI 美化服务返回了无法解析的响应。") from exc
    if not isinstance(payload, dict):
        raise EnhanceError("AI 美化服务返回了意外的响应格式。")
    return payload


def _decode_reference(image_b64: str) -> bytes:
    """Turn the canvas data URL into a square, white-background PNG."""
    if not image_b64 or not image_b64.strip():
        raise EnhanceError("画板快照为空，请先画几笔。")

    encoded = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise EnhanceError("画板快照不是有效的图片数据。") from exc
    if len(raw) > MAX_REFERENCE_BYTES:
        raise EnhanceError("画板快照过大。")

    try:
        with Image.open(io.BytesIO(raw)) as source:
            image = ImageOps.exif_transpose(source).convert("RGBA")
            background = Image.new("RGBA", image.size, "white")
            background.alpha_composite(image)
            square = ImageOps.pad(
                background.convert("RGB"),
                (REFERENCE_SIZE, REFERENCE_SIZE),
                color="white",
                method=Image.Resampling.LANCZOS,
            )
            output = io.BytesIO()
            square.save(output, format="PNG", optimize=True)
    except Exception as exc:  # Pillow raises several unrelated exception types.
        raise EnhanceError("无法读取画板快照，请重试。") from exc
    return output.getvalue()


def _build_prompt(label: str, label_name: str) -> str:
    name = (label_name or "").strip()
    english = (label or "").strip()
    if name and english and name.lower() != english.lower():
        subject = f"「{name}」（{english}）"
    elif name:
        subject = f"「{name}」"
    elif english:
        subject = f"「{english}」"
    else:
        subject = "一幅简笔画"

    return (
        f"参考图是一张用户手绘的{subject}简笔画（黑色线条、白色背景）。"
        "请以参考图的轮廓、主体姿态和构图为依据，把它重新创作为一张完成度很高的现代数字插画，"
        "而不是对纸张或线稿的拍照。\n"
        "- 保留主体的物种、姿态、朝向、主要轮廓和构图位置；\n"
        "- 用完整的色彩、材质和柔和光影重新绘制，使画面像专业插画师的作品；\n"
        "- 背景干净、简洁、有适度留白，与主体协调；\n"
        "- 正方形构图，主体完整居中、比例自然；\n"
        "- 不要出现速写本、纸张纹理、桌面、照片边框、文字、水印或签名；\n"
        "- 不要改变主体物种，也不要加入与主体无关的复杂元素。"
    )


def _upload_reference(image_bytes: bytes) -> str:
    meta = _json_request(
        f"{XAIS_BASE}/xais/fileAttachmentUploadUrl?ext=png",
        headers=_auth_headers(),
        timeout=30,
    )
    url = meta.get("url")
    name = meta.get("name")
    if not isinstance(url, str) or not isinstance(name, str):
        raise EnhanceError("AI 美化服务没有返回可用的上传地址。")

    request = urllib.request.Request(
        url,
        data=image_bytes,
        method="PUT",
        headers={"content-type": "application/octet-stream"},
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            if response.status >= 400:
                raise EnhanceError(f"参考图上传失败（HTTP {response.status}）。")
    except urllib.error.HTTPError as exc:
        raise EnhanceError(f"参考图上传失败（HTTP {exc.code}）。") from exc
    except urllib.error.URLError as exc:
        raise EnhanceError(f"参考图上传失败：{exc.reason}") from exc
    return name


def _start_upstream(reference_name: str, prompt: str) -> str:
    if not XAIS_BASE or not XAIS_MODEL:
        raise EnhanceError("AI 美化服务尚未配置，请设置 XAIS_BASE 与 XAIS_MODEL 环境变量。")
    raw, _ = _request(
        f"{XAIS_BASE}/xais/workerTaskStart",
        method="POST",
        body={
            "model": XAIS_MODEL,
            "prompt": prompt,
            "ref": [reference_name],
            "custom_field": {"resolution": "2k", "ratio": "1:1"},
        },
        headers=_auth_headers(),
        timeout=60,
    )
    text = raw.decode("utf-8", "replace").strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, str):
        task_id = parsed
    elif isinstance(parsed, dict):
        task_id = parsed.get("id") or parsed.get("taskId") or parsed.get("task_id")
    else:
        task_id = text.strip('"').strip()
    if not task_id:
        raise EnhanceError("AI 美化服务没有返回任务编号。")
    return str(task_id)


def _cleanup(now: float) -> None:
    for task_id, record in list(_tasks.items()):
        if now - record.created_at > TASK_TTL_SECONDS:
            del _tasks[task_id]
    if len(_tasks) > MAX_TASKS:
        removable = sorted(
            (record for record in _tasks.values() if record.status != "pending"),
            key=lambda record: record.created_at,
        )
        for record in removable[: len(_tasks) - MAX_TASKS]:
            _tasks.pop(record.id, None)


def start_task(image_b64: str, label: str = "", label_name: str = "") -> str:
    """Upload the sketch, start an upstream task, and return its id."""
    global _starting
    now = time.time()
    with _lock:
        _cleanup(now)
        pending = [
            record for record in _tasks.values()
            if record.status == "pending" and now - record.created_at < TASK_TIMEOUT_SECONDS
        ]
        if _starting or pending:
            raise EnhanceError("上一张 AI 美化图还在生成，请稍候再试。")
        _starting = True

    try:
        reference = _decode_reference(image_b64)
        prompt = _build_prompt(label, label_name)
        reference_name = _upload_reference(reference)
        task_id = _start_upstream(reference_name, prompt)
    finally:
        with _lock:
            _starting = False

    with _lock:
        _tasks[task_id] = TaskRecord(
            id=task_id,
            created_at=now,
            label=label,
            label_name=label_name,
        )
    return task_id


def _download_result(attachment: str) -> tuple[bytes, str]:
    urls = _json_request(
        f"{XAIS_BASE}/xais/attUrls?att={urllib.parse.quote(attachment, safe='')}",
        headers=_auth_headers(),
        timeout=30,
    )
    last_error: Exception | None = None
    for key in ("download", "webp"):
        image_url = urls.get(key)
        if not isinstance(image_url, str) or not image_url:
            continue
        try:
            with urllib.request.urlopen(image_url, timeout=90) as response:
                data = response.read()
                content_type = response.headers.get("content-type", "").split(";")[0].strip()
                if not data:
                    raise EnhanceError("生成的图片为空。")
                if len(data) > 20_000_000:
                    raise EnhanceError("生成的图片过大。")
                return data, content_type if content_type.startswith("image/") else "image/jpeg"
        except (urllib.error.URLError, OSError, EnhanceError) as exc:
            last_error = exc
    raise EnhanceError(f"无法下载生成的图片：{last_error or '没有可用的图片地址'}")


def _payload(record: TaskRecord) -> dict:
    return {
        "status": record.status,
        "progress": record.progress,
        "image_url": f"/api/enhance/{urllib.parse.quote(record.id, safe='')}/image"
        if record.status == "done" else None,
        "error": record.error,
    }


def poll_task(task_id: str) -> dict:
    """Poll one upstream task and return the current status payload."""
    with _lock:
        record = _tasks.get(task_id)
        if record is None:
            raise EnhanceError("任务不存在或已过期，请重新生成。")
        if record.status in {"done", "error"}:
            return _payload(record)
        if time.time() - record.created_at > TASK_TIMEOUT_SECONDS:
            record.status = "error"
            record.error = "生成超时，请稍后再试。"
            return _payload(record)

        try:
            body = _json_request(
                f"{XAIS_BASE}/xais/workerTaskWait?json=1&id={urllib.parse.quote(task_id, safe='')}",
                headers=_auth_headers(),
                timeout=60,
            )
        except EnhanceError:
            raise

        result = body.get("result")
        if isinstance(result, list) and result and isinstance(result[0], str):
            record.attachment = result[0]
            try:
                record.image, record.content_type = _download_result(record.attachment)
            except EnhanceError as exc:
                record.status = "error"
                record.error = str(exc)
            else:
                record.status = "done"
                record.progress = 100
            return _payload(record)

        message = body.get("error")
        if message:
            record.status = "error"
            record.error = str(message)
            return _payload(record)

        progress = body.get("progress")
        if isinstance(progress, (int, float)):
            record.progress = max(0, min(100, int(progress)))
        return _payload(record)


def abandon_task(task_id: str) -> None:
    """Release the single-task slot when the UI discards a pending task.

    The upstream job cannot be cancelled, but marking it as finished lets the
    user start a new beautification without waiting for the 240 s timeout.
    """
    with _lock:
        record = _tasks.get(task_id)
        if record is not None and record.status == "pending":
            record.status = "error"
            record.error = "任务已取消。"


def get_image(task_id: str) -> tuple[bytes, str]:
    with _lock:
        record = _tasks.get(task_id)
        if record is None:
            raise EnhanceError("任务不存在或已过期。")
        if record.status != "done" or not record.image:
            raise EnhanceError("图片还没有生成完成。")
        return record.image, record.content_type
