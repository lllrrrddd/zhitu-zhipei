# SPDX-License-Identifier: Apache-2.0
"""真实简历里反复出现的版面噪声：重复行、撑开的标签、碎片化技能。

这些用例的输入都是按实测样本的**结构**重写的合成文本（不含任何真实个人信息），
覆盖 2026-11 用真实 PDF/DOCX 试测时暴露的问题：

* Word 文本框叠加导致整段文字重复 2–4 遍 → 教育条目重复；
* 标签为对齐被撑开（``姓    名``）→ 姓名识别不到；
* 姓名字间加空格（``王 宇 松`` / ``贾文 杰``）→ 只截到两个字；
* 考研成绩单式的开头把"初试成绩"当成姓名；
* 项目条目里的 ``技术栈：…`` 被当成技能分区标题 → 整段项目描述涌入技能区；
* 技能区里的句子残片（``保障系统稳定。``）与日期串（``2026.01-2026.04``）被当成技能。
"""

from app.services.profile_text_parser import parse_profile_text


def _skill_names(text: str) -> list[str]:
    return [skill.name for skill in parse_profile_text(text).skills]


def test_repeated_text_layer_yields_one_education_entry():
    text = """个人简历个人简历
个人简历
个人简历
基本信息基本信息
基本信息
教育背景教育背景
教育背景
教育背景
2022.09-2026.06 河南某大学 自动化 本科
核心技能核心技能
核心技能
Python（熟练）、SQL（熟练）
"""
    result = parse_profile_text(text)
    assert len(result.educations) == 1
    assert result.educations[0].school == "河南某大学"
    assert result.educations[0].major == "自动化"
    assert result.educations[0].degree == "本科"


def test_padded_labels_and_spaced_name_are_recognized():
    text = """姓    名： 李某某
籍    贯： 河南省周口市
电    话： 13800000000
邮    箱： li@example.com
教育背景
2022.09-至今 河南某大学 自动化 本科
"""
    result = parse_profile_text(text)
    assert result.name == "李某某"
    assert result.phone == "13800000000"
    assert result.email == "li@example.com"


def test_name_split_by_spaces_is_joined():
    text = """王 宇 松
电　　话： 13700000000
教育背景
2022-09 ~ 2026-06 河南某学院 应用化学（本科）
"""
    result = parse_profile_text(text)
    assert result.name == "王宇松"


def test_partially_spaced_name_is_joined():
    # ``贾文 杰``：PDF 文本层只在第二个字前留了空白。
    text = """贾文 杰
龄 ：22 岁
址：河南省郑州市
教育背景
2022.09-2026.06 河南某大学 计算机科学与技术
"""
    result = parse_profile_text(text)
    assert result.name == "贾文杰"


def test_exam_score_header_is_not_a_name():
    text = """报考院校： 某大学 报考专业：计算机技术
初试成绩
政治 英语 高等数学 计算机学科综合 总分
64 80 128 91 363
电　　话： 13800000000
李某某
专业能力：熟悉 Python、SQL
"""
    result = parse_profile_text(text)
    assert result.name == "李某某"


def test_skill_section_rejects_sentence_fragments():
    text = """姓名：张三
专业技能
1、熟悉 Linux 系统运维，可通过日志分析、命令工具排查系统故障，保障系统稳定。
2、Python、Docker、Kubernetes
项目经历
订单系统 后端开发 2026.01-2026.04
技术栈：Java、Redis
负责部分：实现库存预占
"""
    names = _skill_names(text)
    assert "Python" in names
    assert "Docker" in names
    # 句子残片、日期串、区段标签都不该进技能列表
    assert not [n for n in names if n.endswith("。")]
    assert not [n for n in names if n.startswith("2026")]
    assert not [n for n in names if "保障系统稳定" in n]
    assert not [n for n in names if n.startswith("技术栈")]


def test_inline_tech_stack_line_stays_inside_project():
    text = """姓名：张三
项目经历
电商系统 后端开发 2026.01-2026.04
技术栈：Java 17、Spring Boot、MySQL、Redis
主要工作：实现订单幂等
"""
    result = parse_profile_text(text)
    # ``技术栈：…`` 是项目明细，不是新的技能分区；技能区不应因此出现一堆技术名。
    skills = [skill.name for skill in result.skills]
    assert "Redis" not in skills
    assert result.projects, "技术栈行之后的内容仍应留在项目分区"
    assert result.projects[0].name == "电商系统"


def test_non_resume_prefix_is_trimmed_with_warning():
    # 网页打印时正文被一起导出：多段互不相同的长句，重复行收敛不会把它们合成一行。
    prose = "\n".join(
        f"第 {index} 段：这是一段与简历无关的正文，用来模拟网页打印时被一起导出的内容。"
        "这些话既不是技能也不是项目，解析前应当被跳过，否则会被当成技能或经历。"
        for index in range(1, 13)
    )
    text = f"""{prose}

个人简历
教育背景
2022.09-2026.06 河南某大学 软件工程 本科
专业技能
Python、SQL
"""
    result = parse_profile_text(text)
    assert result.educations and result.educations[0].school == "河南某大学"
    assert any("不像是简历内容" in warning for warning in result.warnings)


def test_duplicate_school_entries_merge_into_one():
    text = """姓名：张三
教育背景
2022.09-2026.06 河南某大学 自动化
河南某大学
河南某大学
"""
    result = parse_profile_text(text)
    assert len(result.educations) == 1
