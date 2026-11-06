# 研究生选岗离线评测集 v0.1

本目录包含 5 份虚构研究生画像、14 条来源可追溯的 2027 届岗位事实摘要和作者初标。所有画像是为测试编写的虚构资料。岗位只保留名称、学历、专业偏好、技能关键词、城市、发布日期和来源链接；不复制招聘正文。

## 数据口径

- `profiles.json` 的 `evidence` 是已经确认的样本事实；缺少证据的能力只能标为未知，不能推断为“不具备”。
- `jobs.json` 的 `degree_floor` 是从来源读出的学历底线。`degree_exception=true` 表示来源明确提出可能放宽，不能把硕士直接判作硬性不符。
- `preferred_majors` 是专业偏好，不是硬门槛。`core_skills` 是用于评测的摘要关键词，不等同于招聘方规定的逐项必备条件。
- `application_status=unknown` 表示本次没有查证投递通道是否仍开放；`past_reported_deadline` 表示来源页面写出的截止日早于本次核查日。所有岗位用于离线测试，实际投递前必须打开来源重新核对。
- `labels.json` 是作者初标，用来发现明显错排。至少需要两名未参与编写的人独立复核、记录分歧后，才可称作人工标准答案。

## 试验场景

1. 计算机硕士应能看见 AI 应用、算法与平台岗位的证据差异。
2. 材料硕士应优先看见有电池材料研究关联的岗位。
3. 生物硕士面对“原则要求博士、优秀硕士可放宽”的岗位应得到待确认，而不是硬性淘汰。
4. 金融硕士面对已过页面截止日的岗位不应得到“当前可投递”的建议。
5. 集成电路硕士的数字设计证据不能被当作射频电路经验。
6. 所有硕士画像对明确要求博士且无放宽说明的岗位应被标为硬性不符。

## 来源与限制

- [拼多多算法工程师](https://career.nankai.edu.cn/correcruit/content/id/116276.html)：2026-09-07 发布，面向 2027 届硕士及以上。
- [南京世和基因算法工程师](https://career.nankai.edu.cn/correcruit/content/id/119455.html)、[医学技术支持](https://career.nankai.edu.cn/correcruit/content/id/119464.html)、[测试开发](https://career.nankai.edu.cn/correcruit/content/id/119461.html)、[平台研发](https://career.nankai.edu.cn/correcruit/content/id/119460.html)：均为 2026-09-30 发布的岗位页面；算法岗列有硕士例外条款。
- [中国科学院东莞材料所](https://career.nankai.edu.cn/correcruit/content/id/119468.html)：2026-09-30 发布的招聘一览；AI 应用研发技能摘要参考其[岗位详情页](https://campus.51job.com/dimst2027/m/jobs.html)。
- [昂瑞微官方校招页](https://www.onmicro.com.cn/xyzp/230.html)：列有数字与射频研发岗位，页面未找到发布日期。
- [xTool 校招简章](https://job.hust.edu.cn/zpinfo1/2436703.htm)：2026-09-16 发布，列有材料开发岗位。
- [沃尔核材校招信息](https://job.hust.edu.cn/extxjh/471788308195792.do)：列有高分子材料岗位，页面未找到发布日期。
- [国联研究院校招简章](https://career.nankai.edu.cn/correcruit/content/id/118057.html)：2026-09-07 发布，列有固态电池研发岗位。
- [信银理财校招信息](https://job.hust.edu.cn/zpinfo1/2454473.htm)：页面发布时间为 2026-10-15，但正文载明网申截至 2026-10-10；按已过截止日处理，且这处日期矛盾需人工核验。

本集目前只有 14 条岗位，未达到路线图计划的 20～30 条；城市和专业分布不均。它是回归测试与演示样本的起点，不能据此宣称推荐效果或岗位实时有效。

## 首轮基线

`baseline_report_2026-11-04.md` 记录用现有打分与排序函数在结构化输入上的结果；逐项输出见 `baseline_2026-11-04.json`。该流程绕过 OCR、JD 自动抽取和模型判断，不能作为端到端准确率。运行脚本：`scripts/run_graduate_benchmark.py`。

`candidate_sources_2026-11-04.md` 另列 6 个可扩充的岗位页面。它们尚未核对投递状态和独立标注，因此不计入现有 14 条岗位或本次指标。

## 独立复核与方向匹配实验

运行 `scripts/build_graduate_review_forms.py` 已生成 `review_forms/reviewer_a.md`、`reviewer_b.md`。两份表不显示作者初标，要求两位未参与编写者分别核对 5×14 组相关性、硬门槛、岗位状态与证据；填写前不要查看 `labels.json`，并记录来源摘要的更正。文件已存在时脚本会停止，避免覆盖人工填写。

`directional_experiment_report_2026-11-04.md` 与同名 JSON 是规则实验；同一规则现已接入 `/graduate` 页面，但它与初标同集设计、同集试算，不是独立效果验证。

`evidence/graduate-ranking-feedback-20261105.png` 是浏览器自动化在虚构画像上生成的界面截图，展示排序依据、建议和反馈入口。截图仅证明该演示流程可运行，不代表推荐准确率或真实用户评价。

下一轮真实试用按 `真实效果验证执行方案.md` 操作，逐人填写 `真实试用记录模板.md`。含个人资料的记录只放本机 `private_trials/`，不进入公开仓库。
