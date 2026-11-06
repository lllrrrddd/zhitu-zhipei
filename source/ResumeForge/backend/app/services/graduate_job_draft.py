# SPDX-License-Identifier: Apache-2.0
"""Conservative local draft extraction; every candidate must be user-confirmed."""

import re
from datetime import date
from urllib.parse import urlsplit

from ..schemas.graduate import GraduateJobDraft
from .jd_parser import parse_jd
from .job_text_parser import parse_job_text

DEGREE_WORDS = {"bachelor": "本科", "master": "硕士", "doctor": "博士"}
GRADUATION_YEAR = re.compile(r"(?<!\d)(20\d{2})(?:届|年毕业)")
PREFERENCE = re.compile(r"优先|加分|优待")
DEADLINE_DATE = re.compile(r"(?<!\d)(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?")
SOURCE_URL = re.compile(r"https://[^\s<>\"']+")


def _source_url(text: str) -> str:
    for match in SOURCE_URL.finditer(text):
        candidate = match.group().rstrip("，。；;、),）")
        try:
            parsed = urlsplit(candidate)
        except ValueError:
            continue
        if parsed.hostname and not parsed.username and not parsed.password:
            return candidate[:500]
    return ""


def _major_candidates(lines: list[str]) -> tuple[list[str], str]:
    for line in lines:
        if not re.search(r"专业(?:要求|方向)?\s*[:：]", line):
            continue
        value = re.split(r"[:：]", line, maxsplit=1)[1]
        if "不限" in value:
            return [], line
        value = re.sub(r"(?:等)?相关专业.*$", "", value).strip()
        parts = [part.strip(" ，、;；。") for part in re.split(r"[,，、;；]", value)]
        majors = [part for part in parts if 2 <= len(part) <= 40 and "专业" not in part]
        return list(dict.fromkeys(majors))[:30], line
    return [], ""


def _required_graduation_year(lines: list[str]) -> tuple[int | None, bool]:
    years: set[int] = set()
    for line in lines:
        for clause in re.split(r"[，,；;。]", line):
            for match in GRADUATION_YEAR.finditer(clause):
                if not PREFERENCE.search(clause):
                    years.add(int(match.group(1)))
    return (next(iter(years)) if len(years) == 1 else None, len(years) > 1)


def parse_graduate_job_draft(text: str, *, today: date | None = None) -> GraduateJobDraft:
    """Reuse the upstream parser, preserving unknown and ambiguous job facts."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    base = parse_job_text(text)
    source_fragments: dict[str, str] = {}
    warnings = ["本地提取仅生成候选草稿；请逐项对照招聘原文后再确认。"]

    degree_lines = [
        line for line in lines if re.search(r"学历|学位|本科及以上|硕士及以上|博士及以上", line)
    ]
    degree_hits = {
        degree for degree, word in DEGREE_WORDS.items() if any(word in line for line in degree_lines)
    }
    degree_floor = next(iter(degree_hits)) if len(degree_hits) == 1 else "unknown"
    if degree_floor != "unknown" and all(
        PREFERENCE.search(line) and not re.search(r"(?:及|以)上|不低于", line)
        for line in degree_lines
    ):
        degree_floor = "unknown"
    if degree_lines:
        source_fragments["degree_floor"] = degree_lines[0][:500]
    if degree_floor == "unknown":
        warnings.append("学历底线缺失或存在多个候选，请人工核对。")
        if any(PREFERENCE.search(line) for line in degree_lines):
            warnings.append("原文含学历优先条件，未将其当作最低学历要求。")

    graduation_year, conflicting_years = _required_graduation_year(lines)
    if graduation_year:
        source_fragments["graduation_year"] = next(
            line[:500] for line in lines if str(graduation_year) in line
        )
    elif conflicting_years:
        warnings.append("出现多个毕业届别，已留空供人工核对。")
    elif GRADUATION_YEAR.search(text):
        warnings.append("原文含毕业届别优先条件，未将其当作硬性届别要求。")

    majors, major_line = _major_candidates(lines)
    if major_line:
        source_fragments["preferred_majors"] = major_line[:500]
    if not majors:
        warnings.append("没有可靠识别出专业要求，已留空。")

    requirements = base.requirements or text
    skill_tags = parse_jd(requirements)["skills"]
    skill_lines = lines
    skills = [
        skill.name
        for skill in skill_tags
        if any(skill.name.casefold() in line.casefold() for line in skill_lines)
    ][:40]
    if skills:
        source_fragments["core_skills"] = next(
            line[:500] for line in skill_lines if any(skill.casefold() in line.casefold() for skill in skills)
        )
    else:
        warnings.append("没有可靠识别出核心能力，已留空。")

    source_url = _source_url(text)
    if not source_url:
        warnings.append("未识别到 HTTPS 招聘来源，请手动粘贴原文链接。")
    application_status = "unknown"
    for line in lines:
        if "截止" not in line:
            continue
        match = DEADLINE_DATE.search(line)
        if not match:
            continue
        try:
            deadline = date(*(int(part) for part in match.groups()))
        except ValueError:
            continue
        source_fragments["application_status"] = line[:500]
        if deadline < (today or date.today()):
            application_status = "past_reported_deadline"
            warnings.append("原文记载的截止日期已过，请重新核对岗位是否开放。")
        break
    return GraduateJobDraft(
        company=base.company,
        title=base.title,
        city=base.location,
        degree_floor=degree_floor,
        graduation_year=graduation_year,
        preferred_majors=majors,
        core_skills=skills,
        source_url=source_url,
        application_status=application_status,
        source_fragments=source_fragments,
        warnings=warnings,
    )
