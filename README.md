# 职引 · 简历到 offer 的导航

研究生求职的工作台：把一份简历变成**可投的岗位清单 + 能过筛的简历 + 有记录的投递进度**。

本目录同时是团队参赛作品的工作区，代码基线来自开源项目 [ResumeForge](https://github.com/magicapple123/ResumeForge)（Apache-2.0，许可证见 `source/ResumeForge/LICENSE`），本项目的品牌、账号体系、部署形态与界面改动见 `docs/开源复用与项目增量.md`。

> 品牌说明：2026-11-11 起产品名从「职途智配」改为「**职引**」。下文历史记录里出现的旧名指同一产品。

## 演示时会看到什么（先看，少踩坑）

- **岗位库默认是空的**：`start-demo.ps1` 启动后会导入一份演示岗位——**读的是仓库自带的
  `app/demo/graduate/official_jobs.json`，几秒完成**，不抓外网。不想导入加 `-NoSeed`。
- **有两套岗位数据，数字对不上是正常的**：
  | 位置 | 内容 | 数量级 |
  |---|---|---|
  | 面试/题库用的「官方样例」`/api/graduate/official` | 仓库自带 JSON（虚构摘要） | **20 条** |
  | 首页「找岗位」用的招聘市场库 | 从企业公开页面抓取的岗位 | **170+ 条**（随抓取变化） |
  演示时先说清楚用哪一套，否则第一次看会以为漏数据。
- **匹配结果可能大片「待核对」**：官方样例 20 条里有 11 条**岗位页没写学历**（如华为 O13/O14）。
  规则遇到学历未明确时直接判「待核对」，不会猜——所以某些画像会看到"方向匹配很少"，
  这是有意的保守行为，不是匹配坏了。
- **方向对比可能几乎是空的**：同上，待核对占比高时对比表内容少。要演示"对比有效"，
  请挑学历写明的岗位（如先正达、伊利等来源）试。
- **邀请制是可配置的**：默认**开放注册**（`/api/auth/register` 直接成功）；要变成邀请制，
  设 `ZY_REQUIRE_INVITE=1`，此时注册必须带有效邀请码，`/api/auth/config` 会返回
  `requireInvite: true` 供界面把输入框标成必填。公网部署建议打开。
- **本地模型的上下文要够大**：助手会带较多工具定义，Ollama 默认 `num_ctx=8192` 很容易装不下，
  报错现在会明确说"对话内容超出该模型的上下文窗口（当前上限 8192 tokens）"。修法：
  在 Modelfile 里 `PARAMETER num_ctx 32768` 重建模型，或减少同时启用的工具。
- **AI 功能必须有模型**：生成/改写简历、模拟面试依赖大模型。没配模型时会明确提示
  「尚未配置大模型 API」（规则匹配不受影响）。配好模型后：本地 Ollama 4B 在本机
  实测 **一次生成约 109 秒、改写约 2 分 46 秒、面试一轮约 35 秒**。
- **本机内存不足时**：模型加载会失败，现在会直接说「模型服务内存不足，加载失败……请关闭
  一些程序或换更小的模型」，而不是笼统的"内部错误"。这类失败重试没用，别一直点。



---

## 第一次用（三个"看起来像 bug"的预期行为）

同学拉下来最常问的三件事，其实都是设计如此：

1. **看不到登录页** —— `start-demo.ps1` 是**单机演示模式**（`requireLogin=false`），
   打开就是自己的数据，没有账号概念。要登录页 / 要多人用：
   用 `scripts\start-lan.ps1`（默认要求登录），或给后端设 `ZY_REQUIRE_LOGIN=1`。
2. **点「AI 生成」报错或没反应** —— AI 功能必须先配模型。仓库不含模型，也不含你的
   API Key。设置页填 Base URL + 模型名（本地 Ollama 或在线服务）才能用；
   没配时接口会明确返回「尚未配置大模型 API」，这是**预期提示**，不是崩溃。
   本机没装模型时，岗位匹配、简历预览、导出这些**规则类功能**照常可用。
3. **粘贴识别弹窗里输入框"是空白"** —— 正常渲染时长这样（有灰色占位示例文字）。
   如果你看到完全空白、连边框都没有，多半是浏览器缩放到非 100% 或用了非常规字体，
   先按 Ctrl+0 复原缩放再试；仍旧异常请把**电脑截图**（不是手机拍照）发出来。

## 从 GitHub 拉下来能直接跑吗？

**不能开箱即用，但三条命令可以。** 仓库只放源码，下面这些按设计不进仓库：

| 不进仓库 | 为什么 | 怎么办 |
|---|---|---|
| `node_modules/`、`frontend/dist/` | 依赖与构建产物，可重建 | `setup.ps1` + `scripts\start-lan.ps1` 自动装/构建 |
| Python venv | 同上 | `.\setup.ps1` |
| 语音识别模型（233MB） | 模型权重不随代码分发 | `scripts\fetch-asr-model.ps1` |
| `runtime/`（数据、日志） | 含个人简历等隐私数据 | 首次启动自动建空库 |
| 本地 Ollama 模型 | 需本机安装 | 不装也能用：AI 功能提示未配置，规则匹配不受影响 |

```powershell
git clone <repo>; cd <repo>
& .\setup.ps1                     # Python venv + 前端依赖
& .\scripts\fetch-asr-model.ps1   # 可选：语音作答要它
& .\scripts\start-lan.ps1         # 局域网可用，打印可访问地址
```

## 一、跑起来：三种形态

三种形态共用同一套代码，差别只在「端口怎么暴露」和「谁的数据」。

| 形态 | 用途 | 入口 |
|---|---|---|
| 本机单机 | 自己一个人用，不需要登录 | `start-demo.ps1`（前端 5173 + 后端 8005） |
| 局域网 | 同一 WiFi 的同事/手机打开 | `start-lan.cmd`（单端口 3000，需登录） |
| 公网 | 发布成链接，任何人可访问 | `deploy_main.py`（单端口，走 `$PORT`） |

### 1. 本机单机（最快）

需要 Python 3.11–3.13（推荐 3.12）、Node.js 20.19+。克隆后在 PowerShell 里：

```powershell
& .\setup.ps1          # 首次：装依赖
& .\start-demo.ps1     # 起服务并打开 http://127.0.0.1:5173/
& .\stop-demo.ps1      # 用完停掉
```

单机模式**不要求登录**：后端 `/api/auth/config` 返回 `requireLogin=false`，登录页直接透传。

### 2. 局域网（同事能打开）

```powershell
& .\scripts\start-lan.ps1                       # 默认 3000、需要登录
& .\scripts\start-lan.ps1 -Port 3010 -RequireLogin 0
```

脚本做三件事，**漏任何一件都会白忙**：构建前端（首次）→ 把 `ZY_TRUSTED_ORIGIN_HOSTS`
设成本机局域网 IP（否则所有写请求 403）→ `ZY_COOKIE_SECURE=0`（http 下否则不发 cookie）。
启动后窗口会打印两个地址：本机 `127.0.0.1` 与同一 Wi-Fi 设备用的局域网地址。

前置条件：先跑过一次 `.\setup.ps1`（建 venv 装依赖）。数据默认落 `runtime\lan-data\`，
与演示模式互不干扰；语音模型装了会自动带上，没装则只能打字。

手动起也可以，环境变量如下（完整清单见 `.env.example`）：

```powershell
$env:PORT = 3000                      # 监听端口，绑 0.0.0.0
$env:RF_FRONTEND_DIST = 'source\ResumeForge\frontend\dist'
$env:RF_DATA_DIR = 'runtime\lan-data'  # 数据目录（SQLite、附件、导出物）
$env:ZY_REQUIRE_LOGIN = 1             # 开启登录门禁
$env:ZY_COOKIE_SECURE = 0             # http 下必须关掉 Secure，否则浏览器不发 cookie
$env:ZY_TRUSTED_ORIGIN_HOSTS = 192.168.0.111   # 本机局域网 IP，见下方"踩坑"
$env:ZY_INVITE_CODE = 8位数字邀请码
$env:ZY_ADMIN_KEY = 管理员密钥        # 发邀请码/重置码要它；留空等于关闭管理接口
```

> **踩坑：`ZY_TRUSTED_ORIGIN_HOSTS` 不是可选项。** 后端的 `loopback_origin` 中间件只认
> `127.0.0.1 / localhost / ::1` 作为浏览器 Origin。用 `http://192.168.x.x:3000` 打开时，
> 浏览器发的 `Origin` 不在白名单 → **所有 POST/PUT/PATCH/DELETE 一律 403**，
> 表现是"页面能看，一登录就失败"。改成自己的局域网 IP 即可；刻意没做"私网全放行"。

防火墙若开启，注意**网络位置是「公用」时规则要带 public**，只放行 private 没用：

```powershell
netsh advfirewall firewall add rule name="Zhiyin 3000" dir=in action=allow `
  protocol=TCP localport=3000 profile=public,private,domain
```

### 3. 公网（单端口）

发布沙箱只给一个公网端口，因此前端产物必须由后端同源托管（`mount_static_spa`），不能前后端分端口。

```python
# deploy_main.py 的核心就三件事：指定前端产物、指定数据目录、自己读 PORT
os.environ.setdefault("RF_FRONTEND_DIST", str(ROOT / "ui"))
os.environ.setdefault("RF_DATA_DIR", str(ROOT / "data"))
uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "3000")))
```

**不要**把启动命令写成 `uvicorn app.main:app --port $PORT`：发布沙箱里 `$PORT` 不会展开，
uvicorn 收到空参数直接退出（`Option '--port' requires an argument`）。

启动自检会校验 `app/data`、`app/prompts`、`app/templates`、`alembic.ini`、`migrations/versions`
是否齐全，缺一个就报"安装包不完整，后端无法启动"。

---

## 二、账号与权限

托管形态下（`ZY_REQUIRE_LOGIN=1`）**邀请制**：

- 注册需要 8 位数字邀请码，一次性，注册成功才消耗；
- 登录名可以是**邮箱或 11 位手机号**（二选一，不是两个都要）；
- 密码用标准库 `hashlib.scrypt` 哈希（不依赖 bcrypt 这类 C 扩展）；
- 会话是 HttpOnly + SameSite=Lax 的 cookie，https 部署下带 Secure；服务端只存 token 的 sha256；
- 未登录**只能读**：写请求在中间件统一 401（不逐条路由加依赖，那样一定会漏）。

### 一人一份数据

每个账号一个独立的 SQLite 文件：`<RF_DATA_DIR>/users/<id>/resume_forge.db`，首次登录时自动迁到当前 schema。
**不共用一张表加 `user_id` 过滤**——那要改几百条路由的查询，漏一条就是越权读别人的简历；物理隔离下漏写 where 也串不了库。

用户产物同样按账号分目录（`<RF_DATA_DIR>/users/<id>/files/`）：上传/捕获、资料附件、转介绍图片、
网页填写用的浏览器 profile、导出分享包。字体、日志、招聘岗位库、账号库仍是全局的。

### 密码忘了怎么办

没有邮件服务，用**一次性重置码**：

1. 管理员调 `POST /api/auth/admin/reset-code`（header `X-Admin-Key`），body `{"account":"邮箱或手机号"}`；
2. 把返回的 8 位数字给用户，24 小时内有效，用一次作废；
3. 用户在登录页「忘记密码」里填：账号 + 重置码 + 新密码；
4. 改密成功后**该用户所有已登录会话立即失效**。

管理接口都需要 `X-Admin-Key`，密钥来自环境变量 `ZY_ADMIN_KEY`，未配置时等于关闭：

| 接口 | 作用 |
|---|---|
| `POST /api/auth/admin/invites` | 发邀请码（`{"count":2,"note":"..."}`） |
| `POST /api/auth/admin/reset-code` | 发重置码（`{"account":"..."}`） |

---

## 语音（面试作答）

面试支持「面试官念题」与「说代替打字」，全部本地运行、音频不出机器：

| 能力 | 实现 | 依赖 |
|---|---|---|
| 念题 | 浏览器 `speechSynthesis`（优先中文音色） | 无，离线可用 |
| 作答 | 页面录音 → 16k 单声道 WAV → `POST /api/interview/transcribe` | sherpa-onnx 模型 |

**模型安装**（不随仓库分发，约 160MB）：

```bash
# SenseVoice（默认，中英粤日韩，带 ITN；对带口音的普通话更稳）
curl -L -o sv.tar.bz2 https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2
tar -xjf sv.tar.bz2 -C D://AgentFiles//models//asr
```

然后设 `ZY_ASR_MODEL_DIR` 指向解压目录。目录名里含 `sense-voice` 走 SenseVoice，
否则按 Paraformer 处理；两者都缺时接口返回 **503**，界面提示「请改用打字」。

实测（CPU int8，2 线程）：5 秒音频约 0.2 秒解码，首次调用多约 1 秒加载模型。

## 三、数据目录

`RF_DATA_DIR` 下大致长这样：

```
resume_forge.db           主库（单机模式用它；托管模式下游客读这里）
auth.db                   账号库：users / invites / sessions / reset_codes
users/<id>/resume_forge.db  该账号的业务库
users/<id>/files/...        该账号的上传、附件、导出、浏览器 profile
career-job-market.json    招聘岗位库（全局）
auto-backups/             SQLite 自动备份
logs/                     运行日志
```

备份**只用拷 `RF_DATA_DIR`**（运行中直接拷可能拿到半写状态，建议先停服务）。导入/导出单份数据用应用内的备份功能。

---

## 四、功能概览

**找岗位** → **做简历** → **投递跟进** → **面试准备** → **我的数据**

- **找岗位**（`/`）：上传 PDF/DOCX 或粘贴文字 → 校对学历/毕业年/专业/目标岗位/城市 → 从企业公开来源匹配，每条给出 0–100 规则分、四项构成、招聘原文链接、命中依据与差距清单。同一批岗位换一份档案再匹配，页面下方出「方向对比」。
- **简历中心**：导入识别 → 确认填入 → 生成岗位版简历；每份简历可做**体检单**（ATS + 风险 + 内容质量合并清单，逐条标记后复检看涨分）、风险扫描、修改记录、投递自检。
- **简历制作台**：左栏参数、中栏结构、右栏画布；手动拍快照可任意两版互比与恢复。
- **已保存岗位 / 投递台 / 求职进度**：收藏时记下当时的匹配档案与分数，进度不再靠记忆。
- **面试**：五轮文字模拟面试 + 评分报告。

岗位开放状态与匹配效果**未经真实用户独立验收**，排序不能当作最终求职判断；投递前请在企业官网确认入口。

---

## 五、常见问题

**`curl /` 返回 404，但浏览器正常？**
SPA 回落按 `Accept` 头判断：只有带 `text/html` 的请求才回落 `index.html`。验收命令要写
`curl -H "Accept: text/html" http://127.0.0.1:3000/`。

**页面能看，一登录/保存就 403？**
`ZY_TRUSTED_ORIGIN_HOSTS` 没配或配错了 IP（见上文"踩坑"）。

**局域网换了个 IP 就连不上写接口？**
IP 是 DHCP 分的，变了要同步改 `LAN_IP`（它喂给 `ZY_TRUSTED_ORIGIN_HOSTS`）。

**手机打不开？**
关掉蜂窝数据只连 WiFi；确认路由器没开"AP 客户端隔离"；确认 aTrust/企业管控没拦内网互访。

**改了数据库表结构，老数据怎么办？**
`init_auth_db()` 里有列迁移（如 `users.phone` 用 `ALTER TABLE` 补）；业务库由 Alembic 负责，
启动时自动跑到 head。

---

## 六、开源基线与许可

`source/ResumeForge/` 是第三方开源代码基线（Apache-2.0，许可证与版权声明保留）。对外分发时须如实说明来源与本项目改动。
本项目增量（品牌、账号体系、多用户隔离、局域网/单端口部署、界面改版）见 `docs/开源复用与项目增量.md`。

---

## 七、目录

- `source/ResumeForge/`：应用代码（`backend/` FastAPI + `migrations/`，`frontend/` Vite + React）
- `docs/`：选型记录、口径文档、开源复用与增量说明
- `requirements/`：比赛申报材料副本（原件不在本仓库）
- `samples/`：虚构或脱敏的试测资料
- `evaluation/`：人工标注、测试结果、用户反馈与历次实验报告
- `runtime/`：本机运行时数据（不随仓库发布）

---

## 八、进展记录（按时间，保留事实）

**2026-11-11 · 品牌与账号**
产品更名「职引」，新标识为四角罗盘星（珊瑚→琥珀渐变）。加入邀请制多用户：一用户一 SQLite、
请求级会话绑定、文件产物按账号隔离、密码重置码、手机号或邮箱登录；登录页改为左右分栏品牌页。
新增局域网形态（Origin 白名单）与公网单端口发布。

**2026-11-07 · 解析器复测**
用 12 份真实授权简历做字段级复测并据此修解析器：姓名 2/8 → 7/8，教育条目数 4/8 → 8/8，
清掉"技能列表混入句子残片"。过程见 `evaluation/真实简历解析复测_2026-11-07.md`（原始简历不入库）。
同期演示实例从企业公开来源同步到 170+ 条岗位（数量随抓取时间变化）（华为校招、腾讯招聘、博世、先正达、乐斯福、
艾利丹尼森、尼尔森IQ、欧陆科技、维多集团、伊利校招），每条带原文链接与核对时间；
来源范围见 `source/ResumeForge/docs/official-job-sources.md`。

**2026-11-04 · 公开合成样本试测**
六份有标注的合成 PDF：解析器修复后姓名一致由 3/6 → 5/6，教育条数一致 1/6 → 3/6；
字段内容与工作经历仍有明显错误，不能用于自动判定硬门槛。见 `evaluation/public_resume_probe_2026-11-04.md`。

**2026-11-03 · 本机模型与首轮实测**
本机 Ollama 配置 `zt-zhipei-qwen3.5:4b-cpu`（底座 Qwen3.5 4B Q4，CPU 运行，无需云端密钥），
模型定义在 `models/qwen3.5-4b-cpu.Modelfile`；应用侧 `api_style=openai`、温度 0.1、超时 180s。
同日加入三条 `[测试]` 岗位并跑通匹配分析。见 `evaluation/ops_live_run_2026-11-03.md`。

**研究生评测集 v0.1**
5 份虚构画像 + 14 条来源可追溯的岗位摘要；首轮基线 Precision@5：材料/生物/集成电路均 0.20、金融 0.00。
标签仅为作者初标，不能当产品准确率。见 `evaluation/graduate_benchmark_v0/baseline_report_2026-11-04.md`。

**仍未完成**：独立盲审与真实用户试用、材料 OCR 准确率、教师群体看板、单份 2 MB 上限之外的扫描件通路。
当前岗位数量与解析改善都不能替代这些效果验证。
