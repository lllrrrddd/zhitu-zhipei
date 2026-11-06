# SPDX-License-Identifier: Apache-2.0
"""Inspect user-supplied employment documents without storing them or declaring authenticity."""

import re
from collections.abc import Callable

from fastapi.concurrency import run_in_threadpool

from ..schemas.job_market import (
    CareerExpectedField,
    CareerMaterialFinding,
    CareerMaterialRequest,
    CareerMaterialResult,
)
from .attachments import decode_data_url, normalize_image_attachment
from .document_text import extract_documents_text
from .interview.interview_material import extract_resume_material
from .llm.base import BaseLLMProvider


def _normalized(value: str) -> str:
    return re.sub(r"[\s:：·,，()（）-]", "", value).casefold()


def find_fields(text: str, expected: list[CareerExpectedField]) -> list[CareerMaterialFinding]:
    """A hit only means the same text appeared; document identity remains human-reviewed."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    findings = []
    for field in expected:
        value = _normalized(field.value)
        excerpt = next((line[:180] for line in lines if value in _normalized(line)), "")
        findings.append(
            CareerMaterialFinding(
                label=field.label,
                value=field.value,
                status="text_found" if excerpt else "needs_review",
                excerpt=excerpt,
            )
        )
    return findings


async def inspect_material(
    payload: CareerMaterialRequest, get_provider: Callable[[], BaseLLMProvider]
) -> CareerMaterialResult:
    name = payload.file.name
    suffix = name.rsplit(".", 1)[-1].casefold() if "." in name else ""
    warnings: list[str] = []
    image_urls: list[str] = []
    text = ""
    ocr_used = False
    if suffix in {"pdf", "docx"}:
        extracted = await run_in_threadpool(extract_documents_text, [payload.file])
        text = extracted.text
        image_urls = list(extracted.images)
        # The shared extractor describes scan pages as already recognized; this
        # endpoint only does that after explicit consent and a successful model call.
        warnings.extend(
            warning
            for warning in extracted.warnings
            if "已按图片识别" not in warning and "已逐页按图片识别" not in warning
        )
    elif suffix in {"png", "jpg", "jpeg"}:
        image = normalize_image_attachment(name, payload.file.mime_type, payload.file.data)
        image_urls = [str(image["data_url"])]
        warnings.extend(image.get("notes", []))
    else:
        raise ValueError("材料只支持 PDF、DOCX、PNG 或 JPEG")

    had_document_text = bool(text.strip())
    if image_urls and not payload.allow_ocr:
        if not text.strip():
            raise ValueError("图片或扫描页需要勾选使用当前模型进行文字识别")
        warnings.append("扫描页未识别；如需识别，请勾选使用当前模型")
    elif image_urls:
        # Reuse the existing image transcription path; never pass expected values into the model.
        provider = get_provider()
        if len(image_urls) > 2:
            warnings.append("本次只识别前两张扫描页，其余页请单独上传核对")
        for index, image_url in enumerate(image_urls[:2], start=1):
            mime, raw = decode_data_url(image_url)
            extension = "png" if mime == "image/png" else "jpg"
            recognized = await extract_resume_material(provider, f"page-{index}.{extension}", raw)
            text = f"{text}\n{recognized.text}".strip()
            ocr_used = True
            warnings.extend(recognized.warnings)
        warnings.append("图片文字由模型抄录，可能漏字或认错；请对照原件逐项确认")

    if not text.strip():
        raise ValueError("材料中没有读到可核对的文字，请换清晰图片或可复制文字的文档")
    method = (
        ("mixed" if ocr_used and had_document_text else "image_ocr")
        if ocr_used
        else "document_text"
    )
    return CareerMaterialResult(
        name=name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1],
        method=method,
        text=text[:16000],
        warnings=warnings,
        findings=find_fields(text, payload.expected),
    )
