"""Run the production prototype rules on structured graduate fixtures only.

The rules were designed after reading this dataset, so output is diagnostic,
not independent evidence of product accuracy.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "evaluation" / "graduate_benchmark_v0"
BACKEND = ROOT / "source" / "ResumeForge" / "backend"
sys.path.insert(0, str(BACKEND))

# Re-export both for the experiment's boundary tests after adding backend to sys.path.
from app.services.graduate_recommendation_rules import assess, recommend  # noqa: E402,F401


def run() -> dict:
    profiles = json.loads((DATA / "profiles.json").read_text(encoding="utf-8"))["profiles"]
    jobs = json.loads((DATA / "jobs.json").read_text(encoding="utf-8"))["jobs"]
    return {
        "scope": "structured-fixture experiment; no OCR, JD extraction, LLM or live opening check",
        "results": [recommend(profile, jobs) for profile in profiles],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = json.dumps(run(), ensure_ascii=False, indent=2) + "\n"
    if args.output is None:
        print(output, end="")
    else:
        args.output.write_text(output, encoding="utf-8")
