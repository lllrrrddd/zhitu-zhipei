"""Material checks report visible text only and require consent for image OCR."""

import asyncio
import base64
import io
import zipfile

import pytest
from app.schemas.job_market import CareerMaterialRequest
from app.services import career_material_check
from app.services.document_text import ExtractedDocuments
from app.services.interview.interview_material import ExtractedMaterial


def _request(name: str, mime: str, data: bytes, *, ocr: bool = False) -> CareerMaterialRequest:
    return CareerMaterialRequest.model_validate(
        {
            "file": {
                "name": name,
                "mime_type": mime,
                "data": f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}",
            },
            "expected": [
                {"label": "专业", "value": "计算机技术"},
                {"label": "毕业年份", "value": "2027"},
            ],
            "allow_ocr": ocr,
        }
    )


def _docx() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>专业：计算机技术</w:t></w:r></w:p>"
            "<w:p><w:r><w:t>毕业时间：2027-06</w:t></w:r></w:p></w:body></w:document>",
        )
    return buffer.getvalue()


def _no_model():
    raise AssertionError("text documents must not call a model")


def test_docx_text_matches_are_excerpts_not_authenticity_claims():
    result = asyncio.run(
        career_material_check.inspect_material(
            _request(
                "sample.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                _docx(),
            ),
            _no_model,
        )
    )
    assert result.method == "document_text"
    assert [finding.status for finding in result.findings] == ["text_found", "text_found"]
    assert "专业" in result.findings[0].excerpt


# A valid 1-pixel PNG is enough to exercise the format and consent boundary.
_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=="
)


def test_image_needs_explicit_ocr_consent():
    with pytest.raises(ValueError, match="勾选"):
        asyncio.run(
            career_material_check.inspect_material(
                _request("sample.png", "image/png", _PNG), _no_model
            )
        )


def test_mixed_scan_without_consent_does_not_claim_ocr(monkeypatch):
    monkeypatch.setattr(
        career_material_check,
        "extract_documents_text",
        lambda _files: ExtractedDocuments(
            text="专业：计算机技术",
            warnings=["第 2 页起为扫描页，已按图片识别。"],
            size_bytes=100,
            images=("data:image/png;base64," + base64.b64encode(_PNG).decode("ascii"),),
        ),
    )
    result = asyncio.run(
        career_material_check.inspect_material(
            _request("mixed.pdf", "application/pdf", b"placeholder"), _no_model
        )
    )
    assert result.method == "document_text"
    assert any("未识别" in warning for warning in result.warnings)
    assert all("已按图片识别" not in warning for warning in result.warnings)


def test_image_ocr_only_reports_text_presence(monkeypatch):
    async def fake_recognition(_provider, _name, _raw):
        return ExtractedMaterial("sample.png", "专业：计算机技术", [])

    monkeypatch.setattr(career_material_check, "extract_resume_material", fake_recognition)
    result = asyncio.run(
        career_material_check.inspect_material(
            _request("sample.png", "image/png", _PNG, ocr=True), lambda: object()
        )
    )
    assert result.method == "image_ocr"
    assert [finding.status for finding in result.findings] == ["text_found", "needs_review"]
    assert "2027" not in result.text
