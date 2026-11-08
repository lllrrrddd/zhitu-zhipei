# SPDX-License-Identifier: Apache-2.0
"""研究型简历的技能回抽：只认词表、够数就不动、回抽要告警。"""

from app.services.profile_text_parser import parse_profile_text
from app.services.skill_lexicon import ALL_SKILL_TERMS, SKILL_TERMS, mentions


def test_lexicon_merges_base_and_research_terms():
    assert set(SKILL_TERMS).issubset(set(ALL_SKILL_TERMS))
    # 新增的研究类词能在文本里被认出来
    found = mentions("用 HPLC 与电化学工作站检测，并用 XRD 表征材料")
    assert {"色谱分析", "电化学", "材料表征"}.issubset(set(found))


def test_research_resume_without_skill_section_gets_skills_backfilled():
    text = """姓名：王某某
教育背景
2022-09-2025-06 河南某大学 应用化学 硕士
项目经历
电化学传感器用于乳制品残留检测 2025-01-2025-12
负责材料制备与实验方案设计，使用电化学工作站与 HPLC 完成检测，查阅文献并分析数据。
"""
    result = parse_profile_text(text)
    names = [skill.name for skill in result.skills]
    assert "电化学" in names
    assert any("没有独立的技能区" in warning for warning in result.warnings)


def test_normal_resume_keeps_its_own_skills_untouched():
    text = """姓名：李某某
专业技能
Python、Docker、Kubernetes
项目经历
订单系统 后端开发 2026.01-2026.04
使用 Python 与 MongoDB 完成订单服务。
"""
    result = parse_profile_text(text)
    names = [skill.name for skill in result.skills]
    assert names[:3] == ["Python", "Docker", "Kubernetes"]
    # 已经有技能区，不该再往技能栏里塞项目里出现的词
    assert "MongoDB" not in names
    assert not any("回抽" in warning for warning in result.warnings)


def test_no_matchable_text_changes_nothing():
    text = """姓名：赵某某
教育背景
2022-09-2026-06 河南某大学 软件工程 本科
"""
    result = parse_profile_text(text)
    assert result.skills == []
    assert not any("回抽" in warning for warning in result.warnings)
