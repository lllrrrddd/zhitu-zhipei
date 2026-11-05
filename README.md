# 职途智配项目工作区

本目录存放郑州大学首届 AI 智能体创新应用大赛 B2 方向的项目资料与代码。

## 从 GitHub 下载后使用（Windows）

需要 Python 3.11–3.13（推荐 3.12）、Node.js 20.19+ 和 npm。克隆仓库后，在 PowerShell 中进入仓库目录，运行：

```powershell
& .\setup.ps1
& .\start-demo.ps1
```

浏览器打开 `http://127.0.0.1:5173/graduate`。使用结束后运行 `& .\stop-demo.ps1`。首次安装会下载 Python 和前端依赖；本地模型不是必需项，研究生选岗实验台可直接使用虚构样本。PDF/DOCX 识别默认走本地规则，效果依赖文档质量。`runtime/`、个人简历、申报材料、数据库和模型权重不随仓库发布。

这是可操作的原型，岗位开放状态和匹配效果未经真实用户独立验收，不能把排序当作最终求职判断。开源基线来自 [ResumeForge](https://github.com/magicapple123/ResumeForge)，Apache-2.0 许可证位于 `source/ResumeForge/LICENSE`；本项目改动见 `docs/开源复用与项目增量.md`。

## 目录

- `requirements/`：比赛申报表与团队技术栈说明书的副本。原件保留在原位置。
- `source/ResumeForge/`：从 GitHub 获取的开源基础代码。其原始许可证见该目录的 `LICENSE`。
- `docs/`：选型记录、第一阶段目标和后续开发记录。
- `samples/`：仅放虚构或经过授权且脱敏的试测资料。
- `evaluation/`：后续保存人工标注、测试结果和用户反馈。
- `evaluation/graduate_benchmark_v0/`：虚构研究生画像、可追溯岗位摘要和初步人工标签；仅用于离线评测。

## 当前状态

已导入基础代码，完成简历导入字段校对、部分解析修复和“硬门槛优先”的批量排序。研究生选岗实验台已经能走通“确认画像 → 粘贴或录入岗位 → 核对原文 → 规则分组排序 → 查看依据和一条简历表达建议”的演示流程；其真实岗位适配效果尚待独立标注与目标用户试用验证。

后端已在本机创建 `backend/.venv`，健康检查 `/api/health` 返回 200。匹配评分定向测试通过。已在 `runtime/` 放入经 SHA256 校验的 Node.js 22.23.4 便携版，前端依赖已安装且生产构建通过。已完成虚构运维简历和三条虚构岗位的本机匹配试测；尚需研究生目标用户和有来源的真实岗位进行场景验收。

第一轮输入见 `samples/fictional_resume.txt` 和 `samples/fictional_jobs.md`，预期验收见 `docs/first-milestone.md`。

## 导入简历并识别

打开“简历中心”，点击“导入简历并识别”，选择 PDF 或 DOCX，再点击弹窗里的“识别并填入”。检查识别出的字段，点击“确认填入”，最后在“我的资料”页面保存全部资料。也可以在“我的资料”查看态直接点击“导入简历并识别”。

无模型配置时应用使用本地规则识别，实际 PDF 和 Word 样本均能提取教育、经历、项目和技能；配置模型后可再比较识别质量。`samples/derived/ops_resume_structured.txt` 保留了栏目和日期结构，适合对外演示和回归测试。

校对清单会在识别值逐字出现在文档文字或模型图片抄录中时显示对应片段；未能直接定位的值需要人工核对。图片抄录仅证明字段与模型抄录一致，仍要对照原图。修改字段后旧片段会清除，避免错误来源跟着新值显示。

2026 年 11 月 3 日已向本机原型加入三条 `[测试]` 岗位并运行匹配分析，结果和局限见 `evaluation/ops_live_run_2026-11-03.md`。当前匹配分析在未配置模型时只给“待确认”结论，不能用于验证真实的岗位适配效果。

2026 年 11 月 4 日加入六份有标注的公开合成 PDF 试测。解析器修复后，姓名与标注一致的样本由 3/6 变为 5/6，教育条数一致的样本由 1/6 变为 3/6；字段内容和工作经历仍有明显错误，不能直接用于自动判定岗位硬门槛。中文界面品牌已改为“职途智配”，原第三方许可证保留。详见 `evaluation/public_resume_probe_2026-11-04.md` 和 `docs/职途智配改造路线.md`。

参赛原型的侧栏、使用引导与网页 favicon 已换为本工作区新绘制的“职途智配”SVG 标识。原项目源码与许可证继续保留，复用功能和本项目改动分开记录在 `docs/开源复用与项目增量.md`。

批量选岗现先按硬性门槛再按参考分排序；模型横向对比若违反这一顺序会被拒绝并重试。研究生评测集 v0.1 已收录 5 份虚构画像、14 条来源可追溯的岗位摘要；招聘开放状态大多未确认，不能当作实时岗位库。运行 `python scripts/validate_graduate_benchmark.py` 可校验样本之间的引用关系。

已用结构化研究生样本调用现有打分与排序函数建立首轮基线。材料、生物、集成电路画像的 Precision@5 均为 0.20，金融画像为 0.00；此测试绕过文档识别与模型判断，标签也仅为作者初标，不能作为产品准确率。结果与提交差距见 `evaluation/graduate_benchmark_v0/baseline_report_2026-11-04.md`、`docs/提交准备核对_2026-11-04.md`。

已准备两份不显示初标的独立复核表，并完成一组结构化方向匹配规则实验。它能在这批样本上分开显示方向匹配、需核对、学历不符和页面记载过期的岗位，但规则参考了同一批样本，不能当作独立准确率。详情见 `evaluation/graduate_benchmark_v0/directional_experiment_report_2026-11-04.md`。

现已把实验接入应用的“研究生选岗”入口：选虚构画像，或在“我的资料”导入并保存简历后加载自己的资料；核对学历、毕业年份、专业、城市和项目能力依据，勾选确认，再查看岗位方向、依据和来源。用户可粘贴招聘原文，经本地规则提取候选岗位字段，逐项人工核对后加入同轮比较；也可手工录入。自录岗位会记录这次条件核查日期，但不代表投递通道仍开放。需核对岗位给出下一步问题，有证据命中的岗位可展开一条定向简历表达建议。用户可填写采纳或拒绝的理由，主动下载包含来源与证据的本地反馈 JSON。新增事实会触发重新确认与重排。演示岗位的开放状态尚未实时核实，当前提取不保证覆盖任意 JD，未知学历等硬门槛保持待核对；原始简历到任意 JD 的可靠自动核验及端到端效果仍需验证。工程验证数字见 `docs/提交准备核对_2026-11-04.md`。

## 本机启动

第一次使用建议先看 `docs/先用起来.md`，其中有虚构研究生简历的试用步骤和本机模型识别等待时间。

推荐在 PowerShell 中运行 `& 'D:\LLMOCR简历\start-demo.ps1'`。脚本会启动前后端、把演示数据和日志放在 `runtime/demo/`，并打开 `http://127.0.0.1:5173/graduate`。结束时运行 `& 'D:\LLMOCR简历\stop-demo.ps1'`。端口被占用时可指定参数，例如 `& 'D:\LLMOCR简历\start-demo.ps1' -BackendPort 8006 -FrontendPort 5174`。异常退出留下的旧进程记录会在下次启动时自动清理；已有演示进程运行时会拒绝重复启动。这套演示数据与源码目录中的默认本地数据分开；研究生选岗规则不依赖模型，其他需要模型的原有功能须在隔离演示实例的“模型设置”中单独配置。

手动启动方式如下：

在 PowerShell 中进入 `D:\LLMOCR简历\source\ResumeForge\backend`，运行：

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8005
```

另开一个 PowerShell 终端，运行前端：

```powershell
Set-Location 'D:\LLMOCR简历\source\ResumeForge\frontend'
$env:VITE_BACKEND_URL='http://127.0.0.1:8005'
& 'D:\LLMOCR简历\runtime\node-v22.23.4-win-x64\node.exe' '.\node_modules\vite\bin\vite.js' --host 127.0.0.1 --port 5173
```

随后在浏览器打开 `http://127.0.0.1:5173/`。`8005` 是后端 API 端口。停止时在两个终端分别按 Ctrl+C。本机已配置下述 Ollama 模型；岗位资料导入与本地规则也可用虚构样本试测。

`source/ResumeForge/` 是第三方项目的代码基线。比赛提交时应如实说明其来源和团队的实际改动，保留许可证与版权声明。

前端全量测试可在 PowerShell 运行 `& 'D:\LLMOCR简历\scripts\test-frontend.ps1'`。脚本将 Vitest 临时文件固定在 `runtime/vitest-temp/`，避免本机系统 Temp 目录被清理时出现模块文件丢失。

## 本地免费模型

2026 年 11 月 3 日已在本机 Ollama 配置 `zt-zhipei-qwen3.5:4b-cpu`，底座为 Apache-2.0 许可的 Qwen3.5 4B Q4。模型运行在 CPU 上，无需云端 API 密钥。模型定义保存在 `models/qwen3.5-4b-cpu.Modelfile`。换机后可运行：

```powershell
ollama pull qwen3.5:4b-q4_K_M
ollama create zt-zhipei-qwen3.5:4b-cpu -f 'D:\LLMOCR简历\models\qwen3.5-4b-cpu.Modelfile'
```

应用的“模型设置”使用 `http://127.0.0.1:11434/v1`、模型名 `zt-zhipei-qwen3.5:4b-cpu`、`api_style=openai`、超时 180 秒、温度 0.1、`extra_body={"reasoning_effort":"none"}`。源码默认数据目录与本机当前的隔离演示实例均已保存这套配置；换机后新的演示数据目录仍需单独配置。2026 年 11 月 5 日演示实例连接自检成功，模型回复“正常”，耗时约 19 秒。运行时请确认 Ollama 服务在后台。详见 `evaluation/ops_live_run_2026-11-03.md` 的早期模型试测结果。
