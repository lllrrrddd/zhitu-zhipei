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


def test_compatibility_glyphs_are_unified():
    """某些 PDF 把「大」写成康熙部首 ⼤（U+2F24），"大学"后缀就匹配不上了。"""
    text = """姓名：王某某
教育背景
2022-09 〜 2026-06 江汉⼤学 -- 数字媒体技术 （本科）
主修课程：Java、数据结构
"""
    result = parse_profile_text(text)
    assert len(result.educations) == 1
    assert result.educations[0].school == "江汉大学"
    assert result.educations[0].major == "数字媒体技术"
    # 学历的括号要去掉，否则下拉框认不出来
    assert result.educations[0].degree == "本科"
    assert result.educations[0].start_date == "2022-09"


def test_course_score_fragments_do_not_become_schools():
    text = """姓名：李某某
教育背景
2022-09 扬舟科技大学 物理计算机系 学士
主修课程：Python（95/100），结构化程序设计（97/100），GPA(3.49/4.0)
"""
    result = parse_profile_text(text)
    assert len(result.educations) == 1
    assert result.educations[0].school == "扬舟科技大学"


def test_trailing_article_is_trimmed_with_warning():
    article = "\n".join(
        f"第 {index} 段：这一段是与简历无关的正文，讲的是招聘渠道与检索技巧，"
        "既不是项目也不是技能，长度足够触发尾部裁剪的判定阈值。"
        for index in range(1, 40)
    )
    text = f"""姓名：赵某某
教育背景
2022-09-2026-06 河南某大学 软件工程 本科
专业技能
Python、SQL

{article}
"""
    result = parse_profile_text(text)
    # 简历部分照常解析，文章部分被剪掉并告知用户
    assert result.educations and result.educations[0].school == "河南某大学"
    assert any("末尾" in warning for warning in result.warnings)


def test_short_prose_paragraph_is_not_treated_as_article():
    """自我评价再长也不该被当成"尾部文章"剪掉。"""
    text = """姓名：孙某某
教育背景
2022-09-2026-06 河南某大学 软件工程 本科
自我评价
学习能力强，能在陌生领域快速找到切入点并交付结果。
喜欢把模糊的问题拆成可验证的小步骤，再逐个解决。
愿意为团队补位，做过跨部门协作与对外沟通。
"""
    result = parse_profile_text(text)
    assert result.summary
    assert not any("末尾" in warning for warning in result.warnings)


def test_school_suffix_moves_into_major_when_degree_follows():
    """``中北大学 软件工程-网络与信息安全方向（本科）`` 被切成"学校＝中北大学软件工程"。"""
    text = """姓名：周某
教育背景
2022-09 ~ 2026-06 中北大学 软件工程-网络与信息安全方向（本科）
"""
    result = parse_profile_text(text)
    assert len(result.educations) == 1
    assert result.educations[0].school == "中北大学"
    assert result.educations[0].major == "软件工程-网络与信息安全方向"
    assert result.educations[0].degree == "本科"


def test_project_bullet_fragments_are_not_skills():
    text = """姓名：郑某
项目经历
售后工单 Agent | Agent 全栈 | 2026.07-2026.10
主要工作：
完善支付安全 ...
构建秒杀准入与补偿 …
专业技能
Python、FastAPI
"""
    names = [skill.name for skill in parse_profile_text(text).skills]
    assert "Python" in names
    assert not [name for name in names if name.endswith("…") or name.endswith("...")]
    assert "主要工作" not in names


def test_repeated_resume_blocks_keep_only_the_first():
    """把简历贴给 AI 的导出件里，同一份简历会连同标题一起被粘贴多遍。"""
    block = """教育背景
2022-09-2026-06 河南某大学 软件工程 本科
专业技能
Python、SQL、Docker
项目经历
订单系统 后端开发 2026.01-2026.04
"""
    chat = "这张简历排版清晰，我帮你把文字提取出来，并给出生成 PDF 的步骤。\n"
    text = "姓名：吴某\n" + block + chat + block + chat + block
    result = parse_profile_text(text)
    assert result.name == "吴某"
    assert len(result.educations) == 1
    assert any("重复粘贴" in warning for warning in result.warnings)


def test_emoji_prefixed_section_headings_are_recognized():
    """模板简历把 emoji 放在标题前（``🎓教育背景``）：不剥掉就整段错位。

    真实样本里三份网页打印件因此把学校取到后面副本、把技能混进项目名。
    """
    text = """姓名：陈某
🎓教育背景
北华大学 软件工程 (本科) 2024.09 - 2028.06
⚙专业技能
熟悉 Java，掌握 MySQL、Redis
💼实习经历
某公司 后端开发 2026.06 - 2026.10
负责订单接口
"""
    result = parse_profile_text(text)
    assert [item.school for item in result.educations] == ["北华大学"]
    assert result.educations[0].major == "软件工程"
    assert result.educations[0].degree == "本科"
    names = [skill.name for skill in result.skills]
    assert "Java" in names and "MySQL" in names
    # 标题行本身不能变成技能
    assert not [name for name in names if "技能" in name or "教育" in name]


def test_bracketed_skill_group_is_not_split_into_fragments():
    """``并发（线程池、锁、AQS）`` 是一个技能：括号里的顿号不是技能分隔符。"""
    text = """姓名：孙某
专业技能
熟悉 Java，掌握集合、并发（线程池、锁、AQS）、JVM 内存与 GC
熟悉 MySQL，掌握索引、事务与 MVCC
"""
    names = [skill.name for skill in parse_profile_text(text).skills]
    assert "并发（线程池、锁、AQS）" in names
    # 拆分产生的半边括号残片不再是技能
    assert not [name for name in names if name.count("（") != name.count("）")]
    assert "锁" not in names


def test_scored_language_certificates_are_not_skills():
    """``雅思 7.0`` / ``CET-6 585 分`` 是证书成绩，不是技能名。"""
    text = """姓名：周某
专业技能
Java、SQL
语言能力：雅思 7.0，CET-6 585 分
"""
    names = [skill.name for skill in parse_profile_text(text).skills]
    assert "Java" in names and "SQL" in names
    assert not [name for name in names if "雅思" in name or "CET" in name]


def test_education_row_without_school_keeps_major_and_warns():
    """学历行原文没写学校（PDF 文字层丢列）：保留专业与学历并提示补学校。"""
    text = """姓名：李某
个人简历
出生年月：2005.07
求职意向：软件测试工程师
计算机科学与技术 | 本科 2023.09 - 至今
专业技能
Python、SQL
"""
    result = parse_profile_text(text)
    assert len(result.educations) == 1
    entry = result.educations[0]
    assert entry.school == ""
    assert entry.major == "计算机科学与技术"
    assert entry.degree == "本科"
    assert any("没有学校名" in warning for warning in result.warnings)


def test_resume_title_line_marks_where_the_resume_starts():
    """聊天记录导出：正文文章之后的一行"个人简历"才是简历起点，表头不能被当文章剪掉。"""
    article = "\n".join(
        [
            "去哪里找一些人的简历",
            "找简历的渠道选择，取决于你找人的目的：是企业 HR、猎头，还是个人想学习参考。",
            "不同场景下，最高效的路径不太一样。下面按招聘方与个人两类分别说明。",
            "主流招聘平台覆盖面最广，适合中基层和通用型岗位的初步筛选工作。",
        ]
    )
    text = f"{article}\n个人简历\n计算机科学与技术 | 本科 2023.09 - 至今\n专业技能\nPython、SQL\n"
    result = parse_profile_text(text)
    # 表头活下来了：学历行没被当作文章剪掉
    assert len(result.educations) == 1
    assert result.educations[0].major == "计算机科学与技术"
    assert [skill.name for skill in result.skills] == ["Python", "SQL"]
