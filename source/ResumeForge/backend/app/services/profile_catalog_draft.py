# SPDX-License-Identifier: Apache-2.0
"""识别草稿的新目录视图（F4 契约 §6）：旧解析结果 → definition_catalog 的 13 分区草稿。

**为什么后端做而不是前端映射**：旧 /api/profile/parse-text 返回旧 Profile 形状（七个分区、
cet4_score 等已移除字段）；F6 的资料页按 13 大字段/106 默认小字段渲染。若前端自己写一张
旧→新映射表，目录一改就漂移（违反 R-16 的"小字段清单只有一份"）。因此后端直接按
definition_catalog 产出草稿，前端只展示/校对。

**形状（Lead 2026-10-25 裁决）**：
- sections: [{key, name, fields: [{field_id, label, value}]}]，顺序 = 13 内置全局顺序；
  fields = 该分区**第一条**解析结果（无解析结果时是一组空值，保证前端能渲染 13 分区）；
- 多条目分区在条目数 > 1 时附加可选 entries: [{fields: [...]}] 承载全部条目；
- 旧响应的旧字段**完整保留**（前端逐批迁移），本模块只做增量字段。

**已移除字段不复活**：教育 CET4/CET6、专业技能的证书/成绩/取得时间等旧字段不在新目录里，
这里按目录字段集合构造，因此它们不可能出现在 sections 中；旧字段值仍留在旧响应里。
"""

from __future__ import annotations

from typing import Any

from ..schemas.profile import ProfileTextParseResult
from .profile import definition_catalog

# 旧 ProfileUpdate 的标量/数组字段 → 新目录字段 id 的映射。只列**简历侧**字段；
# 网申专用项（微信/证件号/家庭信息等）不进 13 分区，留在旧响应里由网申链路消费。
_BASIC_FIELD_MAP: tuple[tuple[str, str], ...] = (
    ("name", "basic_info.name"),
    ("gender", "basic_info.gender"),
    ("birth_year", "basic_info.birth_month"),
    ("phone", "basic_info.phone"),
    ("email", "basic_info.email"),
    ("city", "basic_info.city"),
    ("target_city", "basic_info.target_city"),
    ("job_intent", "basic_info.job_intention"),
    ("personal_website", "basic_info.homepage"),
    ("github", "basic_info.github"),
    ("political_status", "basic_info.political_status"),
    ("photo", "basic_info.photo"),
)

# 每个多条目分区：单条旧 item → {新 field_id: 值}。顺序无关（最终按目录字段顺序取）。
_ENTRY_FIELD_MAPS: dict[str, tuple[tuple[str, str], ...]] = {
    "educations": (
        ("school", "educations.school"),
        ("major", "educations.major"),
        ("degree", "educations.degree"),
        ("study_mode", "educations.study_form"),
        ("degree_type", "educations.degree_type"),
        ("department", "educations.department"),
        ("start_date", "educations.start_date"),
        ("end_date", "educations.end_date"),
        ("gpa", "educations.gpa"),
        ("courses", "educations.core_courses"),
        ("achievements", "educations.achievements"),
    ),
    "experiences": (
        ("company", "experiences.company"),
        ("role", "experiences.title"),
        ("start_date", "experiences.start_date"),
        ("end_date", "experiences.end_date"),
        ("description", "experiences.description"),
    ),
    "campus_experiences": (
        ("organization", "campus_experiences.organization"),
        ("role", "campus_experiences.role"),
        ("start_date", "campus_experiences.start_date"),
        ("end_date", "campus_experiences.end_date"),
        ("description", "campus_experiences.description"),
    ),
    "projects": (
        ("name", "projects.name"),
        ("role", "projects.role"),
        ("start_date", "projects.start_date"),
        ("end_date", "projects.end_date"),
        ("tech_stack", "projects.tech_stack"),
        ("description", "projects.description"),
        ("highlights", "projects.highlights"),
    ),
    "skills": (
        ("name", "skills.name"),
        ("level", "skills.level"),
    ),
    "awards": (
        ("name", "awards.title"),
        ("date", "awards.awarded_at"),
        ("description", "awards.description"),
    ),
}


def build_profile_draft_sections(
    result: ProfileTextParseResult, *, source_text: str = "", transcription: str = ""
) -> list[dict[str, Any]]:
    """按 13 内置分区产出新目录草稿（纯函数；不写库、不调模型）。"""
    return [
        _section_draft(spec, result, source_text, transcription)
        for spec in definition_catalog.BUILTIN_SECTIONS
    ]


def _section_draft(
    spec: definition_catalog.SectionSpec,
    result: ProfileTextParseResult,
    source_text: str,
    transcription: str,
) -> dict[str, Any]:
    entries = _entries_for(spec.key, result)
    if not entries:
        entries = [{}]
    first = _fields_of(spec, entries[0], source_text, transcription)
    draft: dict[str, Any] = {"key": spec.key, "name": spec.name, "fields": first}
    # 只有"多条目且真的解析出多条"时才带 entries；单条时 fields 就是它，避免重复载荷。
    if spec.form == "multi" and len(entries) > 1:
        draft["entries"] = [
            {"fields": _fields_of(spec, values, source_text, transcription)} for values in entries
        ]
    return draft


def _fields_of(
    spec: definition_catalog.SectionSpec,
    values: dict[str, str],
    source_text: str,
    transcription: str,
) -> list[dict[str, str | None]]:
    """按目录字段顺序产出字段值与可定位的原文片段。"""
    fields: list[dict[str, str | None]] = []
    for field in spec.fields:
        value = values.get(field.field_id, "")
        source_excerpt = _source_excerpt(value, source_text, field.field_id)
        source_kind = "text" if source_excerpt else None
        if not source_excerpt:
            source_excerpt = _source_excerpt(value, transcription, field.field_id)
            source_kind = "transcription" if source_excerpt else None
        fields.append({
            "field_id": field.field_id,
            "label": field.label,
            "value": value,
            "source_excerpt": source_excerpt,
            "source_kind": source_kind,
        })
    return fields


def _source_excerpt(value: str, source: str, field_id: str) -> str:
    """只在值逐字出现时给上下文；归一化日期等推断值留给人工核对。"""
    minimum = 2 if field_id == "basic_info.name" else 3
    if not source or not minimum <= len(value) <= 120 or "\n" in value or "\r" in value:
        return ""
    position = source.casefold().find(value.casefold())
    if position < 0:
        return ""
    start = source.rfind("\n", 0, position) + 1
    end = source.find("\n", position)
    if end < 0:
        end = len(source)
    line = source[start:end]
    if len(line.strip()) <= 240:
        return line.strip()
    relative = position - start
    snippet_start = max(0, relative - 50)
    snippet_end = min(len(line), relative + len(value) + 50)
    return ("…" if snippet_start else "") + line[snippet_start:snippet_end].strip() + (
        "…" if snippet_end < len(line) else ""
    )


def _entries_for(section_key: str, result: ProfileTextParseResult) -> list[dict[str, str]]:
    if section_key == "basic_info":
        return [_basic_values(result)]
    if section_key == "summary":
        return [{"summary.content": result.summary}] if result.summary.strip() else []
    if section_key in _ENTRY_FIELD_MAPS:
        return [
            _item_values(item, _ENTRY_FIELD_MAPS[section_key])
            for item in getattr(result, section_key)
        ]
    # publications / research_projects / patents / credentials / languages：旧解析器没有
    # 对应分区（补充事实模块已退役），新目录草稿给一组空字段，由用户补录。
    return []


def _basic_values(result: ProfileTextParseResult) -> dict[str, str]:
    values = {target: str(getattr(result, source, "") or "") for source, target in _BASIC_FIELD_MAP}
    # R-75：旧网申"出生日期"与新"出生年月"共用一份值；解析只给了 birth_date 时回落到它。
    if not values.get("basic_info.birth_month") and getattr(result, "birth_date", ""):
        values["basic_info.birth_month"] = result.birth_date
    return values


def _item_values(item: Any, field_map: tuple[tuple[str, str], ...]) -> dict[str, str]:
    return {target: str(getattr(item, source, "") or "") for source, target in field_map}


__all__ = ["build_profile_draft_sections"]
