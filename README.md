# 职引 · 简历到 offer 的导航

研究生求职的工作台：把一份简历变成**可投的岗位清单 + 能过筛的简历 + 有记录的投递进度**。

本目录同时是团队参赛作品的工作区，代码基线来自开源项目 [ResumeForge](https://github.com/magicapple123/ResumeForge)（Apache-2.0，许可证见 `source/ResumeForge/LICENSE`），本项目的品牌、账号体系、部署形态与界面改动见 `docs/开源复用与项目增量.md`。

> 品牌说明：2026-11-11 起产品名从「职途智配」改为「**职引**」。下文历史记录里出现的旧名指同一产品。

---

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

前端要先构建，再由后端同源托管：

```powershell
cd source\ResumeForge\frontend
npm run build            # 产物在 frontend\dist
```

然后用一份发布包结构（`app/` + `migrations/` + `alembic.ini` + `ui/` + `data/` + `deploy_main.py`）起服务。关键环境变量：

```powershell
$env:PORT = 3000                      # 监听端口（deploy_main.py 绑 0.0.0.0）
$env:RF_DATA_DIR = 'D:\...\lan-data'  # 数据目录（SQLite、附件、导出物）
$env:ZY_REQUIRE_LOGIN = 1             # 开启登录门禁
$env:ZY_COOKIE_SECURE = 0             # http 下必须关掉 Secure，否则浏览器不发 cookie
$env:ZY_TRUSTED_ORIGIN_HOSTS = 192.168.0.111   # 本机局域网 IP，见下方"踩坑"
$env:ZY_INVITE_CODE = 8位数字邀请码
$env:ZY_ADMIN_KEY = 管理员密钥        # 发邀请码/重置码要它；留空等于关闭管理接口
python deploy_main.py
```

**本机现成脚本**：`D:\AgentFiles\projects\start-lan.cmd`（纯 ASCII + CRLF，双击即可，窗口不能关）。它不在仓库里——脚本绑定的 IP、密钥、数据目录都是这台机器的事实。

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
同期演示实例从企业公开来源同步到 177 条岗位（华为校招、腾讯招聘、博世、先正达、乐斯福、
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
