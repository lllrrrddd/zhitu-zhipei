"""Populate only the isolated demo workspace with verified company posting summaries."""

import json
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def request_json(url: str, payload: dict | None = None) -> dict:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"} if body else {},
        method="POST" if body else "GET",
    )
    with urlopen(request, timeout=15) as response:
        return json.load(response)


def seed(port: int, state_path: Path) -> int:
    base = f"http://127.0.0.1:{port}/api"
    catalog = request_json(f"{base}/graduate/official")
    if state_path.exists():
        seeded_ids = set(json.loads(state_path.read_text(encoding="utf-8"))["seeded_ids"])
    elif state_path.with_name("official-seed-v1.done").exists():
        # Older demos already received these nine roles. Preserve any deliberate deletions.
        seeded_ids = {f"O{number:02d}" for number in range(1, 10)}
    else:
        seeded_ids = set()
    added = 0
    for job in catalog["jobs"]:
        if job["id"] in seeded_ids:
            continue
        query = urlencode({"keyword": job["title"], "page_size": 100})
        existing = request_json(f"{base}/jobs?{query}")["items"]
        if any(
            item["company"] == job["company"]
            and item["title"] == job["title"]
            and item["source_url"] == job["source_url"]
            for item in existing
        ):
            seeded_ids.add(job["id"])
            continue
        campus = job["graduation_year"] is not None
        degree = {"bachelor": "本科及以上", "master": "硕士及以上", "doctor": "博士", "unknown": "岗位页未明确，须在官网核实"}[job["degree_floor"]]
        facts = [f"学历：{degree}", f"相关专业：{'、'.join(job['preferred_majors'])}", f"关键能力：{'、'.join(job['core_skills'])}"]
        if campus:
            facts.insert(0, f"招聘届别：{job['graduation_year']}届")
        request_json(
            f"{base}/jobs",
            {
                "title": job["title"],
                "company": job["company"],
                "location": job["city"],
                "job_type": "校招" if campus else "社招",
                "description": catalog["summaries"][job["id"]],
                "requirements": "\n".join(facts),
                "source_url": job["source_url"],
                "posted_at": job["posted_date"] or "",
                "status": "待核实",
                "note": f"官网内容核对日期：{job['source_checked_at']}。开放状态以官网实时显示为准。",
                "origin_source": "企业官网",
            },
        )
        added += 1
        seeded_ids.add(job["id"])
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({"checked_date": catalog["checked_date"], "seeded_ids": sorted(seeded_ids)}, ensure_ascii=False, indent=2), encoding="utf-8")
    return added


if __name__ == "__main__":
    print(f"已添加 {seed(int(sys.argv[1]), Path(sys.argv[2]))} 个企业官网岗位。")
