# SPDX-License-Identifier: Apache-2.0
"""Pure rules shared by the prototype API and the offline experiment."""

from __future__ import annotations

DEGREES = {"bachelor": 1, "master": 2, "doctor": 3}
GENERIC_SKILLS = {"python", "sql", "linux", "git"}
SKILL_EVIDENCE_ALIASES = {
    "材料表征": {"xrd", "sem"},
    "数字电路": {"verilog", "fpga"},
}
MAJOR_ROOTS = (
    "计算机", "软件", "人工智能", "材料", "电池", "生物", "遗传", "金融", "集成电路", "微电子"
)


def _normalized(text: str) -> str:
    return "".join(text.split()).casefold()


def _major_matches(major: str, preferred: list[str]) -> bool:
    actual = _normalized(major)
    if not actual:
        return False
    for option in preferred:
        wanted = _normalized(option)
        if not wanted:
            continue
        if actual in wanted or wanted in actual:
            return True
        if any(root in actual and root in wanted for root in MAJOR_ROOTS):
            return True
    return False


def _matched_skills(required: list[str], evidence: dict[str, str]) -> list[str]:
    confirmed = {_normalized(skill) for skill in evidence}
    return [
        skill
        for skill in required
        if _normalized(skill) in confirmed
        or SKILL_EVIDENCE_ALIASES.get(skill, set()) & confirmed
    ]


def _matched_evidence(required: list[str], evidence: dict[str, str]) -> dict[str, list[dict]]:
    """Return the user's exact excerpt and the skill name that justified each hit."""
    matches: dict[str, list[dict]] = {}
    for skill in required:
        normalized_skill = _normalized(skill)
        aliases = SKILL_EVIDENCE_ALIASES.get(skill, set())
        found = [
            {"skill": actual, "excerpt": excerpt}
            for actual, excerpt in evidence.items()
            if _normalized(actual) == normalized_skill or _normalized(actual) in aliases
        ]
        if found:
            matches[skill] = found
    return matches


def assess(profile: dict, job: dict) -> dict:
    """Return the reason and evidence for one job; unknown is never a hard failure."""
    decision = {
        "job_id": job["id"],
        "source_url": job["source_url"],
        "application_status": job["application_status"],
        "status": "review",
        "reason": "",
        "major_fit": False,
        "matched_core": [],
        "matched_preferred": [],
        "matched_evidence": {},
        "rank_score": 0,
    }
    if job["application_status"] in {"past_reported_deadline", "verified_closed"}:
        decision.update(status="expired", reason="来源页面记载的截止日已过或岗位已关闭；请重新核对")
        return decision
    if job["degree_floor"] == "unknown":
        decision.update(status="review", reason="岗位学历底线未核对，不能判定是否满足硬性条件")
        return decision
    if DEGREES[profile["degree"]] < DEGREES[job["degree_floor"]]:
        if not job["degree_exception"]:
            decision.update(status="blocked", reason="学历低于明确底线，且没有放宽条款")
        else:
            decision.update(status="review", reason="学历有放宽条款，须向招聘方确认")
        return decision
    if job.get("graduation_year") and profile["graduation_year"] != job["graduation_year"]:
        decision.update(status="review", reason="毕业届别与岗位摘要不一致，须核对招聘条件")
        return decision

    major_fit = _major_matches(profile["major"], job["preferred_majors"])
    core = _matched_skills(job["core_skills"], profile["evidence"])
    preferred = _matched_skills(job.get("preferred_skills", []), profile["evidence"])
    matched_evidence = _matched_evidence(
        [*job["core_skills"], *job.get("preferred_skills", [])], profile["evidence"]
    )
    specific_core = [skill for skill in core if _normalized(skill) not in GENERIC_SKILLS]
    generic_core = [skill for skill in core if _normalized(skill) in GENERIC_SKILLS]
    specific_preferred = [
        skill for skill in preferred if _normalized(skill) not in GENERIC_SKILLS
    ]
    enough_evidence = bool(
        specific_core or len(generic_core) >= 2 or (specific_preferred and generic_core)
    )
    score = (
        4 * len(specific_core)
        + len(generic_core)
        + len(specific_preferred)
        + (3 if major_fit else 0)
        + (1 if job["city"] in profile["target_cities"] else 0)
    )
    if major_fit and enough_evidence:
        status = "directional_fit"
        reason = "专业方向和已提供的能力证据有交集；投递状态仍须核实"
    elif not major_fit:
        status = "review"
        reason = "未确认专业方向对应关系，不能仅凭通用技能推荐"
    else:
        status = "review"
        reason = "方向相近，但核心能力证据不足，需补充或核对"
    decision.update(
        status=status,
        reason=reason,
        major_fit=major_fit,
        matched_core=core,
        matched_preferred=preferred,
        matched_evidence=matched_evidence,
        rank_score=score,
    )
    return decision


def recommend(profile: dict, jobs: list[dict]) -> dict:
    assessments = [assess(profile, job) for job in jobs]
    fitted = sorted(
        (item for item in assessments if item["status"] == "directional_fit"),
        key=lambda item: (-item["rank_score"], item["job_id"]),
    )
    return {
        "profile_id": profile["id"],
        "directional_fits": fitted,
        "needs_review": [item for item in assessments if item["status"] == "review"],
        "blocked": [item for item in assessments if item["status"] == "blocked"],
        "expired": [item for item in assessments if item["status"] == "expired"],
        "message": "暂无有证据支持的方向匹配岗位" if not fitted else "岗位开放状态尚未核实",
    }
