"""Regression cases from publicly licensed synthetic resume layouts."""

from app.services.profile_text_parser import parse_profile_text


def test_date_led_education_entry_can_end_with_a_sentence():
    result = parse_profile_text(
        "教育背景\n"
        "2001.09 – 2007.07 扬舟科技大学 物理计算机系 学士\n"
        "2007.07 – 2010.09 函授研究生：杭州大恒科技发展院 计算科学专业；导师陈丽教授。\n"
    )
    assert len(result.educations) == 2
    assert result.educations[1].start_date == "2007-07"


def test_campus_activity_bullet_does_not_create_another_education():
    result = parse_profile_text(
        "教育背景\n"
        "南京艺术设计大学 视觉传达 / 本科 2016 / 09-2020 / 07\n"
        "\uf06c 担任 学生会工作职责 -副主席的岗位执行（2019 / 01-2020 /02 )； 在这\n"
    )
    assert len(result.educations) == 1


def test_question_style_work_heading_closes_education_section():
    result = parse_profile_text(
        "学历：深圳大学·国际经济与贸易\n"
        "过往有哪些工作经历？\n"
        "2011.07-2012.12 一一五科技有限公司 广州 / 运营中心主任助理\n"
        "负责推广活动。\n"
    )
    assert len(result.educations) == 1
    assert len(result.experiences) == 1
    assert "科技有限公司" in result.experiences[0].company


def test_question_style_resume_stops_work_at_the_next_question():
    result = parse_profile_text(
        "过往有哪些工作经历？\n"
        "2011.07-2012.12 一一五科技有限公司 广州 / 运营中心主任助理\n"
        "负责推广活动。\n"
        "大学是怎么度过的？\n"
        "2008.08-2011.07 组建校园社团\n"
        "有哪些兴趣爱好？\n"
        "喜欢摄影和阅读\n"
        "掌握了哪些职业技能？\n"
        "Python、SQL\n"
    )
    assert len(result.experiences) == 1
    assert len(result.campus_experiences) == 1


def test_education_heading_without_parsed_entries_warns_for_review():
    result = parse_profile_text(
        "王红军\n教 育 背 景\n工 作 经 历\n奖 项 证 书\n"
        "2012.9-2016.6 北京清华大学 计算机科学与技术（本科）\n"
    )
    assert result.educations == []
    assert any("教育" in warning and "核对" in warning for warning in result.warnings)


def test_common_alternative_headings_do_not_leak_into_work_history():
    result = parse_profile_text(
        "工作经历\n2022-2023 示例公司 前端工程师\n"
        "掌握技能\nPhotoshop\n"
        "所获嘉奖\n优秀毕业生\n"
        "所持证书\n英语六级\n"
    )
    assert len(result.experiences) == 1
    assert result.experiences[0].company == "示例公司"
    assert result.skills
    assert result.awards
