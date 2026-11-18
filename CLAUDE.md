# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

音昱 Wellness（Yinyu Wellness）场馆预约管理系统。会员端（公开预约 + 扫码签到）+ 员工后台（排课、会员、财务、报表、运维）+ 开放 API。

技术栈：**React 19 + TypeScript + Vite 6** 前端，`src/`；**FastAPI + SQLAlchemy 2.0 + SQLite** 后端，`backend/app/`。UI 为手写 CSS（`src/styles.css`），无 CSS 框架、无组件库。PDF 由 reportlab 生成，短信走欣欣云网关。

## 常用命令

```bash
# 一键启动（建 venv、装依赖、起前后端，日志写入 .dev/）
./dev-start.sh          # 会员端 http://127.0.0.1:38733  后台 http://127.0.0.1:38733/login
./dev-stop.sh

# 分别启动
npm run dev             # 前端 38733，strictPort
npm run dev:api         # 后端 38734（cd backend && uvicorn app.main:app --reload）
npm run build           # tsc -b && vite build —— 唯一的自动化检查（类型检查）
npm run preview         # 预览 dist，端口 38735
npm start               # 后端 38734，0.0.0.0

# 后端依赖（venv 位于 backend/.venv）
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
```

端口约定：前端 38733 / 后端 38734 / preview 38735。Vite 把 `/api` 与 `/uploads` 代理到 `http://127.0.0.1:38734`。

**没有测试框架，也没有 lint 配置。** `npm run build` 里的 `tsc -b` 是唯一的自动化质量闸门（`strict` + `noUnusedLocals` + `noUnusedParameters`，因此未使用的变量会导致构建失败）。后端改动靠手动验证：`curl` 接口或启动后端看日志。

`docs/API.md` 是 API 文档的**唯一来源**；改完接口后运行 `python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（脚本从 Markdown 解析 `#### GET /path` 形式的标题生成页面，缺标题会直接抛错）。

## 架构要点

### 单体部署形态

生产环境是**一个进程**：后端在 `dist/` 存在时把构建产物挂载为 SPA（`SPAStaticFiles`，非 API 路径的 404 回落到 `index.html`），并单独挂载 `/uploads`。所以 `npm run build` 的产物由 FastAPI 直接伺服，不需要额外的静态服务器。

### 数据层：无 Alembic，靠启动时改表

`backend/app/database.py:ensure_schema()` 在每次启动时用 `ALTER TABLE ... ADD COLUMN` 补齐缺失列；`ensure_booking_constraints()` 建两个 SQLite 部分唯一索引（同一会员同一节课只能有一条活跃预约；同一预约的营收流水序号唯一）。

**新增数据库列时必须改两处**：`backend/app/models.py` 里的 ORM 模型，以及 `ensure_schema()` 的 `additions` 字典（否则已有库不会自动获得该列）。

数据库文件默认 `backend/data/wellness.db`（已 gitignore）。可用环境变量 `DATABASE_URL` 覆盖。

### 软删除与回收站

所有业务表继承 `SoftDeleteMixin`（`deleted_at` / `deleted_by` / `deleted_state_json`），删除不是 `DELETE` 而是软删除 + 把 `active/status/visible` 快照进 `deleted_state_json`。回收站逻辑集中在 `backend/app/recycle_service.py`：按资源类型做删除前校验（`_validate_delete`）与恢复前冲突校验（`_validate_restore`），保留 180 天后才允许彻底删除。新增可删除实体时，要在 `RESOURCE_MODELS` / `RESOURCE_LABELS` / `_title` / `_subtitle` 四处登记，并按角色归入 `FRONTDESK_RESOURCES` / `FINANCE_RESOURCES` / `ADMIN_RESOURCES`。

### 预约与消课的核心语义

**预约只占席位，签到才扣权益。** 这是全系统最重要的约定：

- `ClassSession.reserved_count` 是席位计数器，`create_booking` 用条件 UPDATE（`reserved_count < capacity`）原子占位，`_release_session_slot` 在取消时归还。
- `transition_booking()` 是预约状态的唯一入口，动作有 `check_in` / `undo_check_in` / `complete` / `cancel` / `no_show`。
- 消课在 `consume_booking()`：优先用会员卡（自有卡或家庭共享卡，`find_available_card`），没有卡才用体验券。扣减走**乐观锁**——`member_cards` / `experience_vouchers` 有 `version` 列，UPDATE 语句带上 `WHERE version = 旧值`，影响行数不为 1 就抛 409。
- 撤销签到 / 取消预约会通过 `restore_consumption()` 返还卡次数或体验券次数。
- 爽约（`no_show`）会给会员打上 `no_show_blocked_until`，公开预约接口会拦截。

改预约相关逻辑时不要直接改 `booking.status`，一律走 `transition_booking`，否则权益返还和营收冲销会漏掉。

### 权限

两套鉴权并存，可在 `backend/app/deps.py` 看到：

1. **JWT Bearer**（员工与会员）。token 的 `sub` 带前缀区分身份：`staff:<user_id>` 或 `member:<member_id>`；`get_current_user` / `get_current_member` 分别解析。员工角色：`admin` / `finance` / `frontdesk` / `teacher` / `viewer`。依赖项 `require_admin` / `require_staff` / `require_finance` / `require_read`。
2. **API Key**（`X-API-Key: yyk_...`），仅限开放 API，带 scope（`read` / `members:write` / `bookings:write` / `schedule:write` / `catalog:write` / `finance:write` / `settings:write` / `maintenance:write`）。scope 是**按请求路径**映射的（`required_api_key_scope`），新增受保护端点时必须同步更新这个映射，否则 API Key 会以"不支持此接口"被拒。`X-API-Key` 与 Bearer 不能同时使用；API Key 不能用于改密码和查询自身信息（`require_interactive_admin`）。

前端令牌存在 localStorage：员工 `wellness_staff_token`，会员 `wellness_member_token`。前端 API 封装在 `src/lib/api.ts`（`apiFetch` / `downloadFile` / `viewFile`）。

### 财务口径

`backend/app/finance_service.py` 区分四套口径，报表与导出都基于它：

- **现金实收** `cash_received` —— 由 `Transaction.cash_basis` 控制。
- **确认营收** `recognized` —— 由 `Transaction.revenue_mode` 控制：`none`（不入营收，私教/评估购卡强制此项）、`immediate`（购卡时全额确认，团课卡默认）、`amortized`（按天均摊，365 天年卡/组合套餐默认）。
- **年度营收** / **私教营收** —— 私教按实际消课确认，通过 `create_consumption_revenue` 在签到后单独入一笔 `kind="consumption"` 的流水；撤销签到时由 `reverse_booking_revenue` 生成负数 `kind="consumption_reversal"` 冲销。
- 流水 `kind`：`purchase` / `upgrade` / `manual` / `refund` / `consumption` / `consumption_reversal`。购买、升卡、退款流水是审计凭据，**不允许进回收站删除**（`recycle_service._validate_delete` 会拦截）。

### 动态二维码签到

`backend/app/checkin_service.py` 实现双向扫码，代码是 HMAC 签名而非 JWT：

- **会员码**（前缀 `YYM1`）：会员端展示，前台扫码签到。60 秒过期、30 秒后需刷新。
- **课程码**（前缀 `YYS1`）：前台展示，会员扫码签到，只签到本人该课的预约。
- 签到窗口是开课前 30 分钟到课程结束（`assert_check_in_window`）。
- 重复扫码幂等，只提示"已签到"不重复扣课。同一会员同时段多节课会返回 `requires_selection` 让前台先选。

### 后台计划任务

`backend/app/scheduler.py` 起一个守护线程，每 20 秒轮询：按 `BackupPlanSettings` 的时间点自动备份并清理旧备份，同时调用 `send_due_reminders` 发到期提醒。

## 代码风格约定

- **用户可见文案全部中文**（前端界面文案 + 后端 `HTTPException` 的 `detail`）。新增错误提示直接写中文。
- **前端 JSX 极度紧凑**，大量单行表达式、链式 `.then()`、三元内联，这是本仓库的既有风格，不要重排成多行。
- 后端请求体统一用 `payload: dict = Body(...)` 自由字典 + `clean_payload(payload, FIELDS)` 白名单过滤，而不是 Pydantic 模型。
- 响应统一经 `backend/app/serializers.py` 的 `*_dict()` 函数生成，字段命名 snake_case。
- 每个写操作后调用 `audit(db, user, category, action, entity, entity_id, detail)` 写操作日志。
- 后端模块划分：`routers/` 只做 HTTP 层（参数校验 + 调用 service + 返回），业务逻辑放 `*_service.py`。
- 前端页面在 `src/pages/admin/`，共享组件在 `src/components/`，后台通用组件（`PageHeader` / `Field` / `Notice`）在 `src/components/AdminUI.tsx`，基础组件（`Modal` / `Badge` / `Empty` / `Spinner` / `Icon` / `ResponsiveTable`）在 `src/components/UI.tsx`。
- 中英双语：`src/context/LanguageContext.tsx` 提供 `t()`（会员端词条）、`local(zh, en)`、以及 `admin(zh, en?)`——后台文案走 `admin()`，英文回退依次查 `src/lib/adminTranslations.ts`、`src/lib/adminMessages.ts`。新增后台文案要同时补进翻译表。
- 路径别名 `@/` → `src/`（vite 与 tsconfig 都已配置）。

## 本地环境与默认账号

`backend/app/seed.py` 在空库时写入演示数据。种子账号（密码即用户名 + `123`）：`admin/admin123`、`frontdesk/frontdesk123`、`finance/finance123`、`teacher/teacher123`、`viewer/viewer123`。设 `SEED_DEMO_DATA=false` 可只建账号不建演示数据。

短信默认是开发模式：`SMS_DEV_MODE=true`、固定验证码 `SMS_DEV_CODE=246810`（`SMS_XINXINYUN_SP_ID` / `SMS_XINXINYUN_PASSWORD_MD5` 未配置时不会真发短信，只写 `sms_send_logs`）。

其他环境变量：`JWT_SECRET`（**上线前必须改**）、`DATABASE_URL`、`ACCESS_TOKEN_EXPIRE_MINUTES`（默认 10080 = 7 天）。

## 文档

- `docs/API.md` —— 完整接口文档，接口变更后需同步并重新生成 HTML。
- `docs/CHANGELOG_CLIENT.md` / `docs/CHANGELOG_DEVELOPER.md` —— 客户版 / 开发者版更新日志，每个功能批次更新一次。
- `public/help.html` —— 面向场馆人员的操作指南（后台侧边栏"操作指南"入口指向它）。
- 仓库根目录的 `MODIFY1117.docx` / `MODIFY1117.pdf` / `20261110/` 是需求变更原始材料（图像与文档），改需求前先看这里。
