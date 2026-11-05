"""Read-only API probe: parse selected synthetic resumes without saving drafts."""

import base64
import json
import time
from pathlib import Path

import httpx

WORKSPACE = Path(__file__).resolve().parents[1]
SOURCE = WORKSPACE / "source" / "SyntheticResumeData"


def main() -> None:
    results = []
    with httpx.Client(timeout=250) as client:
        for case_id in (1, 2):
            pdf = SOURCE / "resume_list_pdf" / f"{case_id}.pdf"
            truth = json.loads((SOURCE / "result_gt" / f"{case_id}.json").read_text(encoding="utf-8"))
            data_url = "data:application/pdf;base64," + base64.b64encode(pdf.read_bytes()).decode()
            started = time.monotonic()
            response = client.post(
                "http://127.0.0.1:8005/api/profile/parse-text",
                json={
                    "text": "",
                    "documents": [{"name": pdf.name, "mime_type": "application/pdf", "data": data_url}],
                },
            )
            payload = response.json()
            results.append(
                {
                    "id": case_id,
                    "http_status": response.status_code,
                    "engine": payload.get("parse_engine"),
                    "name_matches_gt": payload.get("name") == truth.get("basicInfo", {}).get("name"),
                    "gt_education_count": len(truth.get("education", [])),
                    "parsed_education_count": len(payload.get("educations", [])),
                    "gt_work_count": len(truth.get("workExperience", [])),
                    "parsed_experience_count": len(payload.get("experiences", [])),
                    "warnings": payload.get("warnings", []),
                    "error": payload.get("detail") if response.status_code != 200 else None,
                    "elapsed_seconds": round(time.monotonic() - started, 1),
                }
            )
            print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    target = WORKSPACE / "evaluation" / "public_resume_ai_2026-11-04.json"
    target.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
