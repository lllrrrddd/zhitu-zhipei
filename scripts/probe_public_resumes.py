"""Read-only parsing probe for the selected SynthResume PDFs."""

import base64
import json
import re
import sys
import time
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE / "source" / "ResumeForge" / "backend"))

from app.services.document_text import extract_document_text  # noqa: E402
from app.services.profile_text_parser import parse_profile_text  # noqa: E402


def _compact(value: str) -> str:
    return re.sub(r"\s+", "", value).casefold()


def _label_coverage(expected: list[str], observed: list[str]) -> tuple[int, int]:
    """Count expected labels present in an observed field; never infer correctness from row counts."""
    expected = [_compact(value) for value in expected if _compact(value)]
    observed = [_compact(value) for value in observed if _compact(value)]
    return sum(any(label in field for field in observed) for label in expected), len(expected)


def main() -> None:
    source = WORKSPACE / "source" / "SyntheticResumeData"
    rows = []
    for case_id in (1, 2, 3, 100, 500, 1000):
        path = source / "resume_list_pdf" / f"{case_id}.pdf"
        ground_truth = json.loads(
            (source / "result_gt" / f"{case_id}.json").read_text(encoding="utf-8")
        )
        data_url = "data:application/pdf;base64," + base64.b64encode(path.read_bytes()).decode()
        started = time.monotonic()
        extracted = extract_document_text(path.name, "application/pdf", data_url)
        draft = parse_profile_text(extracted.text)
        education_school_found, education_school_total = _label_coverage(
            [item.get("school", "") for item in ground_truth.get("education", [])],
            [item.school for item in draft.educations],
        )
        work_company_found, work_company_total = _label_coverage(
            [item.get("companyName", "") for item in ground_truth.get("workExperience", [])],
            [item.company for item in draft.experiences],
        )
        education_school_in_text, _ = _label_coverage(
            [item.get("school", "") for item in ground_truth.get("education", [])],
            [extracted.text],
        )
        work_company_in_text, _ = _label_coverage(
            [item.get("companyName", "") for item in ground_truth.get("workExperience", [])],
            [extracted.text],
        )
        rows.append(
            {
                "id": case_id,
                "text_chars": len(extracted.text),
                "gt_name_found_in_text": ground_truth.get("basicInfo", {}).get("name", "")
                in extracted.text,
                "gt_education_count": len(ground_truth.get("education", [])),
                "parsed_education_count": len(draft.educations),
                "education_school_label_found": education_school_found,
                "education_school_label_in_text": education_school_in_text,
                "education_school_label_total": education_school_total,
                "gt_work_count": len(ground_truth.get("workExperience", [])),
                "parsed_experience_count": len(draft.experiences),
                "work_company_label_found": work_company_found,
                "work_company_label_in_text": work_company_in_text,
                "work_company_label_total": work_company_total,
                "parsed_name_matches_gt": draft.name == ground_truth.get("basicInfo", {}).get("name", ""),
                "warnings": [*extracted.warnings, *draft.warnings],
                "elapsed_seconds": round(time.monotonic() - started, 2),
            }
        )
    output = WORKSPACE / "evaluation" / "public_resume_parse_2026-11-04.json"
    output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
