"""Create a factual competition application revision without editing the supplied form."""

from pathlib import Path

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "requirements" / "项目申报表_已填写.docx"
TARGET = ROOT / "submission" / "项目申报表_修订稿.docx"


def replace_paragraph(paragraph, value: str) -> None:
    if paragraph.runs:
        paragraph.runs[0].text = value
        for run in paragraph.runs[1:]:
            run.text = ""
    else:
        paragraph.add_run(value)


def replace_cell(cell, value: str) -> None:
    assert len(cell.paragraphs) == 1, "Only single-paragraph cells are supported"
    replace_paragraph(cell.paragraphs[0], value)


def main() -> None:
    document = Document(SOURCE)
    replace_cell(
        document.tables[0].rows[1].cells[3],
        "□ 创意构思  □ 已确定方案  □ 正在开发\n☑ 已有初步原型  □ 已有较完整作品",
    )
    replace_cell(
        document.tables[2].rows[1].cells[0],
        "面向研究生求职中岗位信息分散、简历事实难核对和投递优先级不清的问题，职途智配提供从简历校对到证据化选岗的辅助流程。当前原型可导入简历并人工校对，用确认后的学历、专业和能力片段与有来源的岗位摘要比较，给出方向匹配、需核对、学历不符或页面记载过期等结论。比赛期间计划增加招聘文本自动抽取、针对性简历诊断与场景化面试；材料核验仅提供人工复核线索。面向研究生和就业指导教师，岗位开放状态以招聘来源为准。",
    )
    functions = [
        "（1）简历画像：复用开源基础应用的 PDF/DOCX 导入和资料管理；用户逐项核对学历、专业、项目与技能，无法定位的字段保持待确认。",
        "（2）岗位选岗：团队新增结构化规则，先核对学历和毕业届别，再按专业与能力证据分组，展示来源、命中片段和需补充的事实；证据改变后可重排。",
        "（3）招聘信息：原型内置 14 条有来源的岗位摘要，也支持用户对照原文手工录入结构化岗位；开放状态未知时不宣称可投递。",
        "（4）下一步将接入 JD 自动抽取，并以语义召回和模型解释做对照实验；模型输出须引用原文，不得替代硬门槛和人工确认。",
        "（5）简历诊断计划围绕目标岗位指出缺失证据和表达问题，给出可采纳或拒绝的修改建议；不得编造经历或成果。",
        "（6）模拟面试可复用基础应用的文本对话能力，后续针对科研项目追问；成绩单、证书等材料 OCR 核验列为后续验证范围。",
        "技术底座为 FastAPI、React 和本地 SQLite。选岗接口采用有界输入与可复算规则；可选模型能力沿用基础应用配置。独立标注、真实试用和隐私审查完成后再扩大使用范围。",
    ]
    paragraphs = document.tables[3].rows[1].cells[0].paragraphs
    assert len(paragraphs) == len(functions)
    for paragraph, value in zip(paragraphs, functions, strict=True):
        replace_paragraph(paragraph, value)
    replace_cell(
        document.tables[4].rows[1].cells[0],
        "一是证据可追溯：将已确认的简历片段与岗位能力要求对应展示，减少只有分数、没有依据的推荐。二是允许弃权：学历不符、届别不符、证据不足和岗位状态未知分别处理，不把未知信息硬判为适合。三是可解释重排：用户补充真实项目证据后，系统标出结论变化。当前创新集中在研究生选岗流程与可复算规则；语义召回、材料 OCR 核验和教师看板仍属计划，不作为现阶段成果。",
    )
    replace_cell(
        document.tables[5].rows[1].cells[0],
        "已基于 Apache-2.0 开源项目 ResumeForge 建立可运行原型，接入简历导入校对和研究生选岗页面。现有离线样本为 6 份公开合成 PDF、5 份虚构研究生画像及 14 条有来源的岗位摘要；浏览器已验证确认画像、补证据重排和手工录入岗位三条路径。六份 PDF 中姓名识别 5/6、教育条数 3/6 与标注一致；规则按同批样本设计，尚无独立准确率。下一步完成双人盲审、新增保留样本、JD 自动抽取、诊断建议和小范围试用。",
    )
    replace_cell(
        document.tables[6].rows[1].cells[0],
        "拟交付可运行的研究生选岗原型、带来源和能力证据的岗位比较、针对性简历诊断与演示材料。先请两位未参与规则编写者独立复核现有样本，再新增 20—30 条岗位做保留集；用 Top-5 命中、排序质量、证据正确率和任务完成率评价，并记录错误类型。争取扩展至 100+ 岗位、50+ 脱敏简历，但这些仍是目标数字；真实研究生和就业指导教师试用、材料 OCR 字段准确率须在实际开展后才能报告。",
    )
    replace_cell(
        document.tables[8].rows[0].cells[1],
        "已有本机可运行原型；暂未发布公开演示链接，可现场展示。",
    )
    replace_cell(
        document.tables[8].rows[1].cells[1],
        "已用 6 份公开合成 PDF 测试简历解析，建立 5 份虚构研究生画像和 14 条来源可追溯的岗位摘要；3 条浏览器交互路径通过。该样本参与了规则设计，尚不能报告独立准确率；双人盲审表已准备，真实研究生和教师试用待开展。",
    )
    replace_cell(
        document.tables[8].rows[2].cells[1],
        "原型基于 Apache-2.0 开源项目 ResumeForge 改造，第三方能力与团队增量在技术说明中分别列出。简历和岗位事实须由用户确认；个人信息最小化使用，演示采用虚构或公开合成样本。",
    )
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    document.save(TARGET)
    print(TARGET)


if __name__ == "__main__":
    main()
