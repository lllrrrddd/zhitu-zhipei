# SPDX-License-Identifier: Apache-2.0
"""技能词表：岗位匹配与简历解析共用同一份，避免两处词表漂移。

原先它只存在于 ``job_market_match`` 里。简历解析也要按同一套口径认技能（研究型简历
常常没有独立的"技能"区，技能只写在项目描述里），所以抽成独立模块——解析器不该为了
一个词典去 import 整个匹配服务（那里还牵着 pypinyin、httpx）。

``RESEARCH_TERMS`` 是这次补的一层：科研/实验类简历的能力词（电化学、色谱、材料表征…）
以及三维/VR 方向，之前的词表只覆盖软件与数据岗，这类画像会抽出 0 条技能。
"""

from __future__ import annotations

import re

SKILL_TERMS: dict[str, tuple[str, ...]] = {
    "Python": ("python",),
    "Java": ("java",),
    "C/C++": ("c++", "c/c++", "c语言"),
    "Go": ("golang", "go语言", "go language"),
    "SQL": ("sql", "mysql", "postgresql"),
    "PyTorch": ("pytorch",),
    "机器学习": ("机器学习", "machine learning"),
    "深度学习": ("深度学习", "deep learning"),
    "大语言模型": ("大语言模型", "大模型", "llm", "large language model"),
    "检索增强生成": ("rag", "检索增强", "retrieval-augmented"),
    "自然语言处理": ("nlp", "自然语言处理", "natural language processing"),
    "多模态": ("多模态", "multimodal"),
    "强化学习": ("强化学习", "reinforcement learning"),
    "计算机视觉": ("计算机视觉", "computer vision", "图像识别"),
    "Linux": ("linux",),
    "Shell": ("shell", "bash"),
    "Docker": ("docker",),
    "Kubernetes": ("kubernetes", "k8s"),
    "Ansible": ("ansible",),
    "监控告警": ("prometheus", "zabbix", "grafana", "监控告警", "observability"),
    "网络协议": ("tcp/ip", "路由协议", "网络协议"),
    "分布式": ("分布式", "distributed systems"),
    "数据库": ("数据库", "database"),
    "Verilog": ("verilog", "systemverilog"),
    "FPGA": ("fpga",),
    "EDA": ("eda", "cadence", "synopsys"),
    "有限元仿真": ("有限元", "ansys", "abaqus", "finite element"),
    "材料表征": ("材料表征", "xrd", "sem", "材料分析", "material characterization"),
    "失效分析": ("失效分析", "failure analysis"),
    "基因编辑": ("基因编辑", "crispr", "gene editing"),
    "测序": ("测序", "sequencing", "ngs"),
    "细胞培养": ("细胞培养", "cell culture"),
    "分子生物学": ("分子生物", "molecular biology"),
    "财务分析": ("财务分析", "financial analysis"),
    "会计": ("会计", "accounting"),
    "审计": ("审计", "audit"),
    "数据分析": ("数据分析", "data analysis", "数据挖掘"),
}

# 科研/实验与内容制作类能力词：招聘 JD 与简历里都用这些说法，且都不是"程序语言"。
RESEARCH_TERMS: dict[str, tuple[str, ...]] = {
    "电化学": ("电化学", "electrochemical", "循环伏安", "阻抗谱"),
    "色谱分析": ("色谱", "hplc", "液相色谱", "气相色谱", "gc-ms", "lc-ms"),
    "光谱分析": ("光谱", "紫外可见", "红外光谱", "拉曼", "xps", "荧光光谱"),
    "质谱分析": ("质谱", "mass spectrometry", "maldi"),
    "材料制备": ("材料制备", "材料合成", "制备优化", "水热", "溶剂热", "cvd"),
    "材料表征": ("材料表征", "xrd", "sem", "tem", "bet", "材料分析"),
    "实验设计": ("实验设计", "实验方案设计", "正交实验", "对照实验"),
    "文献调研": ("文献调研", "文献综述", "literature review"),
    "数据建模": ("数据建模", "建模仿真", "仿真建模"),
    "工艺放大": ("工艺放大", "中试", "产业化推进"),
    "三维渲染": ("ue5", "unreal", "unity", "三维渲染", "实时渲染", "npr"),
    "虚拟现实": ("虚拟现实", "vr", "ar", "增强现实", "混合现实"),
    "交互原型": ("交互原型", "原型设计", "figma", "axure"),
}

# 合并成一张表供"从文本里认技能"使用：先匹配长的别名，避免 "c" 吃掉 "c++"。
ALL_SKILL_TERMS: dict[str, tuple[str, ...]] = {**SKILL_TERMS, **RESEARCH_TERMS}

_ASCII_BOUNDARY = r"(?<![a-z0-9_]){}(?![a-z0-9_])"


def _has(text: str, term: str) -> bool:
    term = term.strip().casefold()
    if not term:
        return False
    if term.isascii():
        return re.search(_ASCII_BOUNDARY.format(re.escape(term)), text) is not None
    return term in text


def mentions(text: str, terms: dict[str, tuple[str, ...]] | None = None) -> list[str]:
    """从一段文本里认出技能词，按词表顺序返回（顺序稳定，便于测试与展示）。"""
    table = terms or ALL_SKILL_TERMS
    haystack = text.casefold()
    return [
        name for name, aliases in table.items() if any(_has(haystack, alias) for alias in aliases)
    ]
