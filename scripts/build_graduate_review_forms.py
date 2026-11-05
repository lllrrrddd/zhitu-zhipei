"""Build blind review forms for the source-backed graduate benchmark."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "evaluation" / "graduate_benchmark_v0"


def _load(name: str) -> list[dict]:
    content = json.loads((DATA / name).read_text(encoding="utf-8"))
    return content["profiles" if name == "profiles.json" else "jobs"]


def build_form(reviewer: str, profiles: list[dict], jobs: list[dict]) -> str:
    lines = [
        f"# 研究生选岗独立复核表 {reviewer}",
        "",
        "请独立完成；不要查看 `labels.json` 或另一位复核者的表。所有画像都是虚构样本，岗位投递状态须重新核对来源页面。",
        "",
        "每行填写相关性（相关／待确认／不相关／无法判断）、硬门槛（满足／不满足／未知）、依据（画像原文与岗位来源中的短片段）和岗位状态核查日期。专业偏好不是硬门槛；未写出的能力是未知，不等于不具备。",
        "",
        f"复核者代号：{reviewer}  复核日期：____-__-__",
        "",
        "## 待核对岗位摘要",
        "",
        "下表是从公开页面提取的测试输入，可能有遗漏或错误。请以来源页面为准，在最终一列记录更正；页面失效也要记录。",
        "",
        "| 编号与岗位 | 学历与例外 | 专业偏好 | 技能摘要 | 状态待核查 | 来源与更正 |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for job in jobs:
        degree = job["degree_floor"]
        if job["degree_exception"]:
            degree += "（存在放宽条款，需核对）"
        lines.append(
            "| "
            + " | ".join(
                [
                    f"{job['id']} {job['company']} {job['title']}（{job['city']}）",
                    degree,
                    "、".join(job["preferred_majors"]),
                    "、".join(job["core_skills"]),
                    job["application_status"],
                    f"[核对页面]({job['source_url']})；更正：____",
                ]
            )
            + " |"
        )
    lines.append("")
    for profile in profiles:
        lines.extend(
            [
                f"## {profile['id']} {profile['name']}",
                "",
                f"学历：{profile['degree']}；毕业届别：{profile['graduation_year']}；专业：{profile['major']}；意向城市：{'、'.join(profile['target_cities'])}。",
                "",
                "已给出的能力证据：",
                "",
            ]
        )
        lines.extend(f"- {skill}：{evidence}" for skill, evidence in profile["evidence"].items())
        lines.extend(
            [
                "",
                "| 岗位 | 来源 | 相关性 | 硬门槛 | 岗位状态与核查日期 | 依据或疑问 |",
                "| --- | --- | --- | --- | --- | --- |",
            ]
        )
        for job in jobs:
            label = f"{job['id']} {job['company']} {job['title']}（{job['city']}）"
            lines.append(f"| {label} | [页面]({job['source_url']}) |  |  |  |  |")
        lines.append("")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DATA / "review_forms")
    args = parser.parse_args()
    profiles = _load("profiles.json")
    jobs = _load("jobs.json")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for reviewer in ("A", "B"):
        path = args.output_dir / f"reviewer_{reviewer.lower()}.md"
        if path.exists():
            raise SystemExit(f"复核表已存在，为避免覆盖人工填写内容而停止：{path}")
        path.write_text(build_form(reviewer, profiles, jobs), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()
