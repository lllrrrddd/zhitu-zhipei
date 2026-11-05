"""PDF text order can place the identity block after work sections."""

from app.services.profile_text_parser import parse_profile_text


def test_unique_standalone_name_after_sections_is_recovered():
    text = (
        "教育背景\n2001.09-2005.07 虚构大学 计算机科学 本科\n"
        "工作经历\n2006.01-2008.01 示例公司 数据工程师\n"
        "李东宝\n求职意向：数据库开发工程师\n手机：13714569872\n"
    )
    assert parse_profile_text(text).name == "李东宝"


def test_ambiguous_standalone_names_are_left_for_confirmation():
    text = "工作经历\n示例公司 数据工程师\n张三\n李四\n手机：13714569872"
    result = parse_profile_text(text)
    assert result.name == ""
    assert "未识别到姓名，请手动填写。" in result.warnings


def test_six_character_body_phrase_is_not_treated_as_unlabeled_name():
    text = "结合节日活动\n2019.03-2020.01 示例公司 新媒体编辑\n工作经历\n参与内容策划"
    assert parse_profile_text(text).name == ""
