# SPDX-License-Identifier: Apache-2.0
"""教育、工作、校园、项目和奖项条目的解析。"""

import re

from .entry_blocks import (
    _block_labeled_value,
    _is_header_metadata_line,
    _parse_header,
    _split_entry_blocks,
)
from .entry_constants import _DATE_RE, _DEGREE_TERMS
from .entry_dedupe import _merge_education_entries
from .entry_details import _detail_groups
from .entry_inference import _compact_header_fields, _find_date_range, _infer_unlabeled_header
from .normalization import _clean_line

# 校园经历的条目头常常是**单列**的「组织 + 职务」连写（如
# 「软件学院向阳工作室总负责人」「2301班团支书」）：从尾部职责词处拆开，
# 组织与角色才各自落位。只在校园分区的单列头部启用——多列头部本来就
# 有明确的角色列，不动。
_CAMPUS_ROLE_SUFFIX_RE = re.compile(
    r"^(?P<organization>.{2,60}?)"
    r"(?P<role>总负责人|负责人|团长|副团长|团支书|书记|部长|副部长|部员|"
    r"主席|副主席|会长|副会长|理事长|班长|副班长|委员|干事|队长|副队长|"
    r"组长|副组长|社长|副社长|成员|志愿者)$"
)

# 项目条目的明细行被误当条目头时的特征标签。
_PROJECT_DETAIL_LABEL_RE = re.compile(
    r"^(?:技术栈|技术选型|技术方案|开发环境|项目周期|项目背景|项目描述|"
    r"负责部分|主要工作|项目成果|项目职责)\s*[:：]"
)

# 教育条目里"学校"字段不该出现的内容：论文/奖项/课程明细被当成学校名后，卡片标题
# 会显示一整段话（实测样本出现 ``6 学术论文（Biomolecules，JCR Q1``）。
_EDUCATION_NOISE_MARKERS = (
    "学术论文",
    "论文",
    "专利",
    "奖学金",
    "竞赛",
    "证书",
    "荣誉",
    "奖项",
    "主修课程",
    "辅修课程",
    # 考研简历常把"报考院校/报考专业"写在教育附近，那是报考意向，不是已就读的教育经历。
    "报考",
)
_MAX_SCHOOL_CHARS = 48
# 带这些后缀的文本仍然像一所学校/研究机构，长度超限也不直接丢。
_SCHOOL_SUFFIX_RE = re.compile(r"(?:大学|学院|学校|研究院|研究所|科学院|校区)")

# 校名后面直接粘着专业名的头部（``中北大学软件工程``）。PDF 文本层按空格切列时，
# 学校与专业可能被当成同一个 token，学校栏就会显示成"中北大学软件工程"。
_SCHOOL_TAIL_RE = re.compile(
    r"^(?P<school>.{2,20}?(?:大学|学院|学校|研究院|研究所))(?P<rest>[\u4e00-\u9fff].{1,20})$"
)
# 这些是校名的一部分（校区、分校、研究生院），不能当作专业名切出去。
_SCHOOL_KEEP_TAILS = ("校区", "分校", "分部", "研究生院", "继续教育")
# 专业栏里挂在末尾的学历：``网络与信息安全方向（本科）``。
_DEGREE_TAIL_RE = re.compile(r"[（(]\s*(?:本科|学士|硕士|博士|专科|研究生)\s*[）)]\s*$")


def _split_school_major(school: str, major: str) -> tuple[str, str]:
    """把误粘在校名后的专业名还给专业栏。

    * 专业栏为空：拆出来的部分直接当专业（``中北大学软件工程`` → 中北大学 / 软件工程）。
    * 专业栏是"方向 + 学历"（``网络与信息安全方向（本科）``）：说明这一行本来写成
      ``中北大学 软件工程-网络与信息安全方向（本科）``，把拆出来的部分接到方向前面，
      学历由调用方单独抽走。
    * 其余情况（专业栏已有实质内容）不动：误拆的代价比留着后缀大。
    """
    if not school:
        return school, major
    match = _SCHOOL_TAIL_RE.match(school)
    if not match:
        return school, major
    rest = match.group("rest")
    if rest.startswith(_SCHOOL_KEEP_TAILS):
        return school, major
    if not major:
        return match.group("school"), rest
    if _DEGREE_TAIL_RE.search(major):
        head = _DEGREE_TAIL_RE.sub("", major).strip(" -—–·")
        combined = f"{rest}-{head}" if head else rest
        return match.group("school"), combined
    return school, major


def _collapse_cjk_spaces(value: str) -> str:
    """去掉中文串内部的对齐空白：``河南 师范大学`` → ``河南师范大学``。

    PDF 文本层按字形间距切词，中文校名与专业名里会留下空格。含拉丁字母的值不动，
    避免把 ``New York University`` 粘成一个词。
    """
    text = str(value or "").strip()
    if not text or re.search(r"[A-Za-z]", text):
        return text
    return re.sub(r"\s+", "", text)


# 成绩碎片：``（ 95``、``100）``、``97/100``、``GPA(3.49``。它们出现在课程明细里，
# 被"/"切开后很像条目头，实测会把"Python（95"当成一所学校。
_SCORE_FRAGMENT_RE = re.compile(r"[（(]\s*\d{2,3}\s*$|\d{2,3}\s*/\s*\d{2,3}|GPA", re.IGNORECASE)
_DEGREE_WRAP_RE = re.compile(r"^[（(]\s*(.+?)\s*[）)]$")
# 专业名后面挂着学历：``数字媒体技术（本科）``。只认括号里是学位词的写法，
# ``软件工程（嵌入式）`` 这类方向说明不动。
_MAJOR_DEGREE_RE = re.compile(
    r"^(?P<major>.*?)\s*[（(]\s*(?P<degree>本科|学士|硕士|博士|专科|研究生)\s*[）)]$"
)


def _split_major_degree(major: str) -> tuple[str, str]:
    """把挂在专业名后面的学历拆出来；拆不出就原样返回。"""
    match = _MAJOR_DEGREE_RE.match(major.strip())
    if not match:
        return major, ""
    return match.group("major").strip(), match.group("degree")


def _unwrap_degree(value: str) -> str:
    """``(本科)`` → ``本科``：学历字段留着括号，界面下拉框认不出来。

    也处理 ``网络与信息安全方向（本科）`` 这种"方向挂学历"的写法：学历只留学位词，
    前面的方向信息在专业字段里本来就有一份，不算丢。
    """
    text = value.strip()
    match = _DEGREE_WRAP_RE.match(text)
    if match:
        return match.group(1)
    trailing = re.search(r"[（(]\s*(本科|学士|硕士|博士|专科|研究生)\s*[）)]\s*$", text)
    if trailing:
        return trailing.group(1)
    return value


def _parse_education(lines: list[str]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for block in _split_entry_blocks(lines, "education"):
        parts, start, end = _parse_header(block[0])
        compact = _compact_header_fields(block[0], "education")
        details, _highlights, _tech, courses, achievements, gpa = _detail_groups(
            [line for line in block[1:] if not _is_header_metadata_line(line)]
        )
        school = (
            _block_labeled_value(block, "school")
            or compact.get("school", "")
            or (parts[0] if parts else "")
        )
        major = (
            _block_labeled_value(block, "major")
            or compact.get("major", "")
            or (parts[1] if len(parts) > 1 else "")
        )
        # 「软件工程专业/本科」这类写法会把量词带进专业名：去掉尾部"专业"，
        # 表单里直接可得"软件工程"。
        if major.endswith("专业") and len(major) > len("专业"):
            major = major[: -len("专业")]
        degree = (
            _block_labeled_value(block, "degree")
            or compact.get("degree", "")
            or next(
                (
                    part
                    for part in parts
                    if any(term.casefold() in part.casefold() for term in _DEGREE_TERMS)
                ),
                "",
            )
        )
        start, end = _find_date_range(
            block, compact.get("start_date", start), compact.get("end_date", end)
        )
        school = _collapse_cjk_spaces(school)
        major = _collapse_cjk_spaces(major)
        degree = _unwrap_degree(_collapse_cjk_spaces(degree))
        school, major = _split_school_major(school, major)
        major, bracketed_degree = _split_major_degree(major)
        if bracketed_degree and (not degree or degree == major):
            degree = bracketed_degree
        # 课程明细里的成绩碎片（``Python（95``、``GPA(3.49``）不是学校，也不是专业。
        if _SCORE_FRAGMENT_RE.search(school) or _SCORE_FRAGMENT_RE.search(major):
            continue
        # 论文/奖项/课程明细被误当学校名时整条丢弃：它连带的"专业/学历"也都是碎片，
        # 留着只会让用户在校对页删条记录。长度只在**明显不是校名**时才作为判据——
        # 「函授研究生：某某科技发展院 计算科学专业；导师陈丽教授。」这类真实教育行
        # 也会很长，用 24 字卡会把整条学历丢掉。
        if any(marker in school for marker in _EDUCATION_NOISE_MARKERS):
            continue
        if len(school) > _MAX_SCHOOL_CHARS and not _SCHOOL_SUFFIX_RE.search(school):
            continue
        if not achievements and details:
            achievements = "\n".join(details)
        if school or major or degree or details:
            result.append(
                {
                    "school": school,
                    "major": major,
                    "degree": degree,
                    "start_date": start,
                    "end_date": end,
                    "gpa": gpa,
                    "courses": courses,
                    "achievements": achievements,
                    "reference_file_name": "",
                    "reference_content": "",
                }
            )
    # 同一所学校被文本重复或字段切分拆成多条时合回一条（见 entry_dedupe）。
    return _merge_education_entries(result)


def _parse_experience(lines: list[str], campus: bool = False) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for block in _split_entry_blocks(lines, "campus" if campus else "experience"):
        parts, start, end = _parse_header(block[0])
        compact = _compact_header_fields(block[0], "experience")
        labeled_first = _block_labeled_value(block, "organization" if campus else "company")
        labeled_role = _block_labeled_value(block, "role")
        inferred_first = inferred_role = ""
        inferred_start = inferred_end = ""
        inferred_details: list[str] | None = None
        if (
            len(parts) <= 1
            and len(block) > 1
            and not labeled_first
            and not compact.get("first")
            and not labeled_role
            and not compact.get("role")
        ):
            (
                inferred_first,
                inferred_role,
                inferred_start,
                inferred_end,
                inferred_details,
            ) = _infer_unlabeled_header(block)
        detail_lines = (
            inferred_details
            if inferred_details is not None
            else [line for line in block[1:] if not _is_header_metadata_line(line)]
        )
        description, _highlights, _tech, _courses, _achievements, _gpa = _detail_groups(
            detail_lines
        )
        start, end = _find_date_range(
            block, compact.get("start_date", start), compact.get("end_date", end)
        )
        first = labeled_first or compact.get("first", "") or inferred_first
        first = first or (parts[0] if parts else "")
        role = labeled_role or compact.get("role", "") or inferred_role
        role = role or (parts[1] if len(parts) > 1 else "")
        if campus and not role and first and len(parts) <= 1:
            match = _CAMPUS_ROLE_SUFFIX_RE.match(first)
            if match:
                first = match.group("organization")
                role = match.group("role")
        if inferred_start and not start:
            start = inferred_start
        if inferred_end and not end:
            end = inferred_end
        if first or role or description:
            item = {
                "role": role,
                "start_date": start,
                "end_date": end,
                "description": "\n".join(description),
                "reference_file_name": "",
                "reference_content": "",
            }
            item["organization" if campus else "company"] = first
            result.append(item)
    return result


def _parse_projects(lines: list[str]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for block in _split_entry_blocks(lines, "project"):
        parts, start, end = _parse_header(block[0])
        compact = _compact_header_fields(block[0], "project")
        labeled_name = _block_labeled_value(block, "project")
        labeled_role = _block_labeled_value(block, "role")
        inferred_name = inferred_role = ""
        inferred_start = inferred_end = ""
        inferred_details: list[str] | None = None
        if (
            len(parts) <= 1
            and len(block) > 1
            and not labeled_name
            and not compact.get("first")
            and not labeled_role
            and not compact.get("role")
        ):
            (
                inferred_name,
                inferred_role,
                inferred_start,
                inferred_end,
                inferred_details,
            ) = _infer_unlabeled_header(block)
        detail_lines = (
            inferred_details
            if inferred_details is not None
            else [line for line in block[1:] if not _is_header_metadata_line(line)]
        )
        description, highlights, tech_stack, _courses, _achievements, _gpa = _detail_groups(
            detail_lines
        )
        start, end = _find_date_range(
            block, compact.get("start_date", start), compact.get("end_date", end)
        )
        name = (
            labeled_name or compact.get("first", "") or inferred_name or (parts[0] if parts else "")
        )
        # 「技术栈：Java 17、Spring Boot…」被当成项目名时，卡片标题会显示一整行技术栈。
        # 这类行本身是项目的明细，退回让 role/description 承担信息。
        if _PROJECT_DETAIL_LABEL_RE.match(name):
            name = ""
        role = (
            labeled_role
            or compact.get("role", "")
            or inferred_role
            or (parts[1] if len(parts) > 1 else "")
        )
        if inferred_start and not start:
            start = inferred_start
        if inferred_end and not end:
            end = inferred_end
        if name or role or description or highlights:
            result.append(
                {
                    "name": name,
                    "role": role,
                    "start_date": start,
                    "end_date": end,
                    "tech_stack": "、".join(tech_stack),
                    "description": "\n".join(description),
                    "highlights": "\n".join(highlights),
                    "reference_file_name": "",
                    "reference_content": "",
                }
            )
    return result


def _parse_awards(lines: list[str]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for block in _split_entry_blocks(lines, "award"):
        clean = " ".join(_clean_line(line) for line in block if line).strip()
        if not clean:
            continue
        date_match = _DATE_RE.search(clean)
        date = date_match.group(0) if date_match else ""
        header = _DATE_RE.sub("", clean, count=1).strip(" -—–|｜丨·") if date else clean
        parts, _start, _end = _parse_header(header)
        name = parts[0] if parts else header
        description = "、".join(parts[1:]) if len(parts) > 1 else ""
        result.append({"name": name, "date": date, "description": description})
    return result
