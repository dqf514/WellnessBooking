# 音昱 Wellness API 对接文档

> 版本：API v1.0.0 · 基于 FastAPI · 本文覆盖当前后端全部 **108 个 HTTP 接口**。
>
> 文档更新：2026-11-10 · 功能基线：预约排课、会员权益与营收业务闭环。
>
> 在线交互文档：`/docs`（Swagger UI）、`/redoc`（ReDoc）；原始 OpenAPI 3 定义：`/openapi.json`。接口路径、方法、参数和实时响应结构以同版本 `/openapi.json` 为最终依据。

## 1. 接入基础

### 1.1 服务地址

| 环境 | API Base URL | 说明 |
| --- | --- | --- |
| 本地前端联调 | `http://127.0.0.1:38733` | Vite 将 `/api`、`/uploads` 代理到后端 |
| 本地后端直连 | `http://127.0.0.1:38734` | Swagger、ReDoc 和 OpenAPI 也在此端口 |
| 生产部署 | 与网站同源 | 后端挂载前端 `dist`，统一使用相对路径 `/api/...` |

下文路径均省略 Base URL。日期采用 `YYYY-MM-DD`，时间采用 24 小时制 `HH:MM`；JSON 时间戳由服务端本地时间格式化为 `YYYY-MM-DD HH:MM:SS`，未发生时为 `null`。金额是数字，单位为元，不使用字符串或“分”。

### 1.2 请求约定

- JSON 写操作使用 `Content-Type: application/json; charset=utf-8`。
- 文件上传使用 `multipart/form-data`，不要手工设置 `boundary`。
- 路径中的 `{xxx_id}` 均为整数 ID；未找到通常返回 `404`。
- 未特别说明的成功响应为 HTTP `200` 和 JSON；创建接口当前也返回 `200`，不是 `201`。
- 下载接口需要相同的 Bearer 鉴权，不能仅靠浏览器地址栏中的 Cookie 登录。
- 除短信、余额查询等明确标注的接口外，业务写操作不依赖第三方服务。

### 1.3 JWT 鉴权

员工或会员登录成功后，从响应取得 `access_token`，之后发送：

```http
Authorization: Bearer <access_token>
```

Token 类型为 JWT，签名算法 HS256；有效期默认 10080 分钟（7 天），可由服务端 `ACCESS_TOKEN_EXPIRE_MINUTES` 修改。员工 Token 的主题是 `staff:<用户ID>`，会员 Token 的主题是 `member:<会员ID>`，两者不能混用。修改密码不会主动吊销已签发 Token；停用账号后，下一次鉴权会失败。

| 文档权限标记 | 可访问角色 / 身份 |
| --- | --- |
| 公开 | 不需要 Token |
| 会员 | 有效会员 Token |
| 员工 | 任意有效员工 Token，用于 `/api/auth/me`、修改自己的密码 |
| 只读 | `admin`、`frontdesk`、`finance`、`teacher`、`viewer` |
| 前台 | `admin`、`frontdesk` |
| 财务 | `admin`、`finance` |
| 管理员 | 仅 `admin` |

权限在服务端强制执行，隐藏前端菜单并不等于接口授权。`teacher` 和 `viewer` 虽可读取业务数据，但不能执行写操作。

### 1.4 API Key 接入鉴权

系统对接可在“系统设置 → API 密钥”创建独立凭证，调用后台接口时发送：

```http
X-API-Key: <完整 API Key>
```

- 密钥以 `yyk_` 开头，服务端只保存 SHA-256 哈希；完整明文仅在创建或轮换响应中返回一次，之后只能查看 `前缀…后四位`。
- 不要把密钥放在 URL、前端代码或公开仓库中。`Authorization: Bearer` 与 `X-API-Key` 不能同时使用，否则返回 `400`。
- API Key 复用创建人的员工身份，实际权限是“创建人当前角色允许范围”和“密钥 scopes”的交集。创建人停用后密钥立即不可用，角色降级也会进一步受限。
- 无效、停用、过期或已删除密钥返回 `401`；角色或 scope 不足返回 `403`。写操作不会因为有 `read` 而自动获得权限。
- API Key 仅用于 `/api/admin` 业务接口，不能访问会员个人接口、查询员工身份、修改密码，也不能管理 API Key；密钥管理只接受管理员 JWT 登录会话。
- 每次携带 `yyk_` 前缀密钥的请求都会记录方法、路径、状态码、IP、User-Agent 和时间，日志不记录完整密钥或 Query String。

| scope | 权限范围 |
| --- | --- |
| `read` | 后台业务数据、报表与普通操作/短信日志读取 |
| `members:write` | 会员、会员卡、会员记录、爽约限制与合同文件写入 |
| `bookings:write` | 后台添加预约、签到、取消签到、完成、取消和爽约 |
| `schedule:write` | 排课、复制周课表与教室占用写入 |
| `catalog:write` | 课程、教室和教练基础资料写入 |
| `finance:write` | 产品、手工入账、退款与电子码核销 |
| `settings:write` | 场馆、品牌、员工账号与短信设置写入 |
| `maintenance:write` | 数据导入导出、备份和恢复 |

```bash
curl "$API/api/admin/dashboard" -H "X-API-Key: $WELLNESS_API_KEY"
```

### 1.5 错误与并发

业务错误格式：

```json
{ "detail": "课程已约满" }
```

FastAPI 参数校验错误格式：

```json
{ "detail": [{ "loc": ["query", "page"], "msg": "Input should be greater than or equal to 1", "type": "greater_than_equal" }] }
```

| HTTP | 常见原因 | 调用方处理 |
| --- | --- | --- |
| `400` | 字段、日期、状态流转或业务规则不合法 | 展示 `detail`，修正后重试，不要原样盲重试 |
| `401` | 未登录、Token 过期、账号停用 | 清除本地 Token 并重新登录 |
| `403` | Token 身份不符或角色无权 | 不自动重试；检查账号与权限 |
| `404` | 资源不存在、已移除或电子码不可核销 | 刷新关联列表 |
| `409` | 排课冲突或会员卡权益并发变化 | 刷新最新数据后由用户确认重试 |
| `422` | FastAPI 路径、查询或 multipart 结构校验失败 | 检查字段名、类型和必填参数 |
| `429` | 验证码 60 秒发送间隔限制 | 按提示等待 |
| `501` | 当前数据库不是 SQLite 文件库 | 备份维护接口不可用 |
| `502` | 短信网关异常 | 检查网关配置、网络及短信日志 |

预约通过原子容量更新和唯一约束防止超约、重复预约；扣次通过会员卡 `version` 乐观锁防止并发重复扣减。收到 `409` 后必须重新读取数据。

### 1.6 分页、筛选与 CORS

- 操作/短信日志固定每页 50 条，API Key 使用日志固定每页 20 条，`page` 均从 1 开始。
- 财务流水按时间倒序最多返回 1000 条；其他列表当前没有分页参数。
- 会员端课表单次跨度最多 31 天；后台课表不限制跨度，但调用方应主动控制范围。
- 开发环境 CORS 仅允许 `127.0.0.1` / `localhost` 的 `38733`、`38735` 端口；生产跨域部署需调整服务端 CORS 配置。

### 1.7 回收站与数据保留

- 可删除资料采用软删除：写入 `deleted_at`、`deleted_by` 和删除前状态，日常列表、会员端、预约权益、报表、导出和短信任务均排除已删除数据；数据库备份仍保留这些数据。
- 普通业务角色只能删除自己有写入权限的资源；恢复和彻底删除仅接受管理员 JWT 登录会话，API Key 不能管理回收站。
- 彻底删除必须满足 `deleted_at + 180 天 <= 服务器当前时间`，提前调用返回 `400`。附件文件在回收站期间保留，只有到期彻底删除时才清理。
- 取消课程、取消预约、销卡、停用和退款是业务状态操作，不等于移入回收站。购买、升卡和退款流水不可删除；手工入账可编辑和软删除。
- 有关联未消课预约的会员或会员卡、有未来正常排课的课程/教练/教室、含有效预约或到课历史的排课不可直接删除；只有已取消预约可移入回收站。

## 2. 通用数据结构

以下为响应字段定义。写入时仍应只传各接口允许的字段，不要回传整个响应对象。

### 2.1 User 员工账号

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | integer | 用户 ID |
| `username` | string | 登录名 |
| `full_name` | string | 显示姓名 |
| `phone` | string | 绑定手机号，未绑定为空字符串 |
| `role` | string | `admin` / `finance` / `frontdesk` / `teacher` / `viewer` |
| `active` | boolean | 是否启用 |
| `created_at` | string | 创建时间 |

### 2.2 Member 会员

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id`、`name`、`name_en`、`phone` | integer / string | ID、中英文名、11 位手机号 |
| `gender`、`id_number`、`birth_date` | string | 性别、证件号、出生日期 |
| `source`、`advisor_id`、`advisor_name` | string / integer / null | 来源、会籍员工 ID 和姓名 |
| `emergency_phone`、`wechat`、`notes` | string | 紧急电话、微信、备注 |
| `no_show_blocked_until` | string | 自助预约限制截止日，无限制为空字符串 |
| `active` | boolean | 是否允许登录与预约 |
| `created_at` | string | 建档时间 |
| `cards` | MemberCard[] | 仅明确标注“含 cards”的接口返回 |

### 2.3 Course、Teacher、Room

**Course**：`id`、`course_type`、`name`、`name_en`、`description`、`description_en`、`duration_minutes`、`price`、`color`、`image_url`、`active`。

**Teacher**：`id`、`user_id`、`name`、`name_en`、`phone`、`gender`、`specialties`、`specialties_en`、`bio`、`bio_en`、`image_url`、`visible`、`active`。

**Room**：`id`、`name`、`name_en`、`capacity`、`floor`、`sort_order`、`color`、`active`。

课程类型现有值为 `group`（团课）、`private`（私教）、`assessment`（评估）、`workshop`（工作坊）、`training`（培训）。`visible=false` 的教练不在会员端教练列表出现；`active=false` 的基础资料不可用于新排课。

### 2.4 CardProduct 与 MemberCard

**CardProduct**：`id`、`name`、`name_en`、`category`、`price`、`original_price`、`validity_days`、`total_sessions`、`benefits`、`description`、`description_en`、`online_sale`、`active`。

**MemberCard**：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id`、`member_id`、`product_id` | integer | 卡、会员和产品 ID |
| `product_name`、`product_name_en`、`category` | string | 冗余展示用产品信息 |
| `card_no` | string | 系统生成卡号 |
| `purchase_price` | number | 实际成交价 |
| `purchased_at`、`starts_on`、`expires_on` | date | 购买日、生效日、到期日 |
| `total_sessions`、`remaining_sessions` | integer / null | 总次数、剩余次数；周期卡可为 `null` |
| `benefits` | object[] | 分课程类型权益，见下表 |
| `status` | string | `active` / `cancelled` / `upgraded`；响应可将过期活动卡显示为 `expired` |
| `frozen_until` | string | 冻结截止日，未冻结为空字符串 |
| `note` | string | 操作备注 |
| `shared_with` | object[] | 共享会员的 `id`、`name`、`phone` |

`benefits[]` 的典型结构为 `{ "course_type": "group", "quantity": 10, "remaining": 8 }`；`course_type="all"` 表示全类型适用。存在匹配权益时优先扣减权益，否则使用产品 `category` 和卡的总剩余次数。`quantity` 是返还上限。

### 2.5 ClassSession 与 Booking

**ClassSession**：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id`、`course_id`、`teacher_id`、`room_id` | integer | 排课及关联 ID |
| `session_date`、`start_time`、`end_time` | string | 日期与起止时间 |
| `capacity` | integer | 容量 |
| `status` | string | `scheduled` / `cancelled` |
| `notes` | string | 备注 |
| `booked_count` | integer | 占位的有效预约数，包含已签到、已完成和爽约 |
| `available` | integer | `max(0, capacity - booked_count)` |
| `course`、`teacher`、`room` | object | 完整关联对象 |
| `bookings` | Booking[] | 仅后台 `detailed=true` 或写排课时返回 |

**Booking**：`id`、`session_id`、`member_id`、`member`、`member_card_id`、`experience_voucher_id`、`card_name`、`status`、`source`、`booked_at`、`cancelled_at`、`cancelled_by`、`checked_in_at`、`completed_at`、`consumed`、`notes`；除嵌套在排课详情中时，还包含完整 `session`。使用体验券消课时 `card_name` 为“免费体验券”。

预约状态为 `booked`（待上课）、`checked_in`（历史已签到状态）、`completed`（已签到消课）、`cancelled`（已取消）、`no_show`（爽约）。来源为 `public` 或 `admin`。新签到直接写入 `completed`；`consumed=true` 表示已经扣除一次卡或体验券权益，重复完成不会再次扣减。

### 2.6 Transaction 财务流水

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id`、`member_id`、`member_card_id`、`product_id` | integer / null | 关联资源 ID |
| `member_name`、`product_name`、`product_name_en` | string | 展示名称 |
| `category` | string | 课程类别或 `misc` 等自定义类别 |
| `kind` | string | `purchase` / `manual` / `refund` / `upgrade` |
| `amount` | number | 入账为正，退款为负 |
| `payment_method` | string | 结账方式，例如 `cash`、`wechat`、`alipay` |
| `status` | string | `pending` / `paid` / `refunded` |
| `occurred_at` | string | 业务发生时间 |
| `note` | string | 备注 |
| `redemption_code` | string / null | 线上购卡电子码 |
| `redeemed_at` | string / null | 核销时间 |

线上申请初始为 `pending`，核销后原单改为 `paid`，不会再新增一条购买流水。退款会新增负数 `refund` 流水，原正数单改为 `refunded`。

## 3. 健康检查与员工认证（6）

### 3.1 服务健康检查

#### GET /api/health

- **权限**：公开；**请求**：无。
- **响应**：`{ "ok": true, "service": "wellness-booking" }`。
- 只表示 HTTP 服务可响应，不替代数据库、短信网关或磁盘备份检查。

### 3.2 员工账号密码登录

#### POST /api/auth/login

- **权限**：公开。
- **Body**：`username`（string，必填）、`password`（string，必填）。
- **响应**：`{ access_token, user }`，`user` 为 User。
- 用户不存在、密码错误或账号停用均返回 `400 用户名或密码错误`。

```bash
curl -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"your_username","password":"your_password"}'
```

### 3.3 员工短信验证码

#### POST /api/auth/sms/send-code

- **权限**：公开；**Body**：`phone`。
- 手机号必须匹配已启用的员工账号，否则 `400`。
- **响应**：`{ ok, message, dev_mode }`；本地演示且短信关闭时额外返回 `dev_code`。
- 验证码 5 分钟有效，60 秒内不可重发，最多尝试 5 次；新验证码会使旧验证码失效。

### 3.4 员工短信登录

#### POST /api/auth/login-sms

- **权限**：公开；**Body**：`phone`、`code`。
- **响应**：同密码登录。短信用途独立为 `staff_login`。

### 3.5 当前员工

#### GET /api/auth/me

- **权限**：员工；**请求**：无 Body。
- **响应**：User 对象，不含 `access_token` 和密码。

### 3.6 修改自己的密码

#### POST /api/auth/change-password

- **权限**：员工；**Body**：`old_password`、`new_password`。
- 新密码至少 8 位；原密码错误返回 `400`。
- **响应**：`{ "ok": true }`。只更新当前 Token 对应员工。

## 4. 会员端接口（9）

### 4.1 会员端初始化数据

#### GET /api/public/bootstrap

- **权限**：公开；**请求**：无。
- **响应**：`venue`、`courses`、`teachers`、`products`。
- `venue` 含 `name`、`name_en`、`address`、`address_en`、`phone`、`logo_url`、`favicon_url`、`booking_cutoff_minutes`。
- 仅返回启用课程、启用且可见教练、启用产品，产品按价格排序。

### 4.2 查询会员课表

#### GET /api/public/sessions

- **权限**：公开。
- **Query**：`date_from`、`date_to`、`course_type`，均可选；默认从今日起 7 天。
- **响应**：`{ items: ClassSession[] }`，仅 `scheduled` 课程，不返回预约名单。
- 结束日期不得早于开始日期，单次最大 31 天，否则 `400`。

### 4.3 发送会员登录验证码

#### POST /api/public/auth/send-code

- **权限**：公开；**Body**：`phone`。
- **响应及限制**：同员工验证码，但用途为 `member_login`，不要求手机号已建档。

### 4.4 会员登录或自动注册

#### POST /api/public/auth/login

- **权限**：公开；**Body**：`phone`、`code`，新会员可传 `name`。
- **响应**：`{ access_token, member }`，Token 身份为会员。
- 首次登录自动建档；未传姓名时使用手机号后四位生成显示名。已停用会员返回 `403`。

### 4.5 会员个人中心

#### GET /api/public/me

- **权限**：会员；**请求**：无。
- **响应**：`{ member, cards, bookings, transactions }`。
- `bookings` 按预约时间倒序，`transactions` 按发生时间倒序，只返回当前会员数据。

### 4.6 会员自主预约

#### POST /api/public/bookings

- **权限**：会员；**Body**：`session_id`。
- **响应**：Booking，包含最新 `session`。
- 校验课程状态、开课时间、自助预约截止分钟数、爽约限制、重复预约和容量。
- 对 `course.price > 0` 的课程，必须已有适用且有效的会员卡；预约本身不扣次，签到或完成时才扣。
- 成功后原子占用一个席位，并按设置发送预约短信；短信失败不会回滚预约。

### 4.7 会员取消预约

#### DELETE /api/public/bookings/{booking_id}

- **权限**：会员，只能取消自己的预约；**Body**：无。
- **响应**：取消后的 Booking。
- 仅 `booked`、`checked_in` 可取消，且课程必须尚未开始。
- 释放席位；若已扣次则返还；发送取消短信。已完成、已取消或爽约记录不可取消。

### 4.8 下载预约日历

#### GET /api/public/bookings/{booking_id}/calendar.ics

- **权限**：会员，只能下载自己的预约。
- **响应**：`text/calendar`，文件名 `booking-<id>.ics`。
- 内容为本地浮动时间，不含时区；课程标题、场馆地址、教练与教室写入日历事件。取消后的预约仍可下载，调用方应先检查状态。

### 4.9 创建线上购卡申请

#### POST /api/public/orders

- **权限**：会员；**Body**：`product_id`。
- **响应**：`pending` 状态 Transaction，含唯一 `redemption_code`。
- 仅启用、`online_sale=true` 且价格不超过 5000 元的产品可线上申请；其他产品提示到店购买。
- 此步不直接开卡、不计为已入账；支付和开卡在后台核销时完成。

## 5. 经营概览与基础元数据（2）

### 5.1 今日经营概览

#### GET /api/admin/dashboard

- **权限**：只读；**请求**：无。
- **响应**：`today_sessions`、`today_bookings`、`checked_in`、`active_members`、`new_members`、`month_revenue`、`month_cash_received`、`upcoming`、`recent_bookings`。
- `upcoming` 最多 8 节今日排课，`recent_bookings` 最多 8 条今日课程预约；`checked_in` 同时统计 `checked_in` 和 `completed`。
- `month_revenue` 是本月至今日的确认营收，`month_cash_received` 是同期现金实收（含退款负数）；口径与第 9.8 节一致。

### 5.2 后台基础元数据

#### GET /api/admin/meta

- **权限**：只读；**请求**：无。
- **响应**：`courses`、`rooms`、`teachers`、`products`、`users` 五个完整数组，包括停用项。
- 用于表单选项和关联展示；接口含全部员工账号，前端不应把响应暴露给非授权用户。

## 6. 会员档案、会员卡、权益与爽约（20）

### 6.1 查询会员列表

#### GET /api/admin/members

- **权限**：只读。
- **Query**：`q`（姓名/英文名/手机号模糊搜索）、`category`（具有该类别活动卡）、`active_only`（默认 `false`）。
- **响应**：`{ items: Member[]（含 cards）, total }`，按 ID 倒序。

### 6.2 新建会员

#### POST /api/admin/members

- **权限**：前台。
- **Body 必填**：`name`、`phone`。
- **Body 可选**：`name_en`、`gender`、`id_number`、`birth_date`、`source`、`advisor_id`、`emergency_phone`、`wechat`、`notes`、`active`。
- **响应**：Member（含 cards）。手机号须符合 `1xxxxxxxxxx` 且全库唯一。

### 6.3 会员完整档案

#### GET /api/admin/members/{member_id}

- **权限**：只读；**请求**：无 Body。
- **响应**：Member（含 `cards`）并增加 `shared_cards`、`bookings`、`records`、`transactions`、`vouchers`、`reminders`、`reminder_alerts`。
- `shared_cards` 是其他会员共享给当前会员、可用于预约签到的卡；`cards[].shared_with` 则列出当前会员卡的共享对象。
- `records[]` 含 `id`、`record_type`、`title`、`content`、`record_date`、`teacher_name`；合同和评估附件通过第 7 章接口单独查询。
- `reminders` 仅含有效提醒，`reminder_alerts` 是已到期提醒及生日前 7 天提示的字符串数组；未来提醒保留在 `reminders` 中，但不会提前弹出。

### 6.4 修改会员

#### PATCH /api/admin/members/{member_id}

- **权限**：前台；**Body**：新建接口的任意可选字段及 `name`、`phone`，按部分更新处理。
- **响应**：更新后的 Member（含 cards）。
- 修改手机号时检查格式及与其他会员的冲突；未传字段保持不变。

### 6.5 到店购卡并开卡

#### POST /api/admin/members/{member_id}/cards

- **权限**：前台。
- **Body**：`product_id` 必填；`price`（默认产品价，不能为负）、`payment_method`（默认 `cash`）、`starts_on`（默认今日）、`note` 可选。
- **响应**：MemberCard。
- 同一事务创建活动会员卡和正数 `purchase` 已入账流水。有效期为 `starts_on + validity_days`，初始次数与权益复制自产品。

### 6.6 维护单张会员卡

#### PATCH /api/admin/cards/{card_id}

- **权限**：前台；**响应**：更新后的 MemberCard。
- **Body 通用**：`action`，不同动作使用不同字段。

| `action` | 附加字段 | 行为 |
| --- | --- | --- |
| `extend` | `days`（非零，绝对值不超过 3650）、`note` | 增加或减少到期日天数 |
| `freeze` | `frozen_until` | 设置冻结截止日，并将卡状态置为 `active` |
| `unfreeze` | 无 | 清空冻结截止日 |
| `activate` | 无 | 状态置为 `active`，不会自动延长已过期日期 |
| `cancel` | 无 | 状态置为 `cancelled`，不生成退款流水 |
| `adjust` | `remaining_sessions`、`benefits`、`note` | 人工校正次数或权益，剩余次数不低于 0 |

每次成功操作增加卡版本。调整权益应传完整 `benefits` 数组；此接口不会反向修改历史预约或财务流水。

### 6.7 批量延期会员卡

#### POST /api/admin/cards/batch-extend

- **权限**：前台；**Body**：`days`（1–365）、`note`。
- **响应**：`{ ok, updated }`。
- 影响所有 `status=active` 且到期日不早于今日的卡；不可通过此接口缩短有效期。

### 6.8 新增训练 / 评估记录

#### POST /api/admin/members/{member_id}/records

- **权限**：前台。
- **Body**：`title` 必填；`teacher_id`、`record_type`（默认 `note`）、`content`、`record_date`（默认今日）可选。
- **响应**：`id`、`record_type`、`title`、`content`、`record_date`，不返回 `teacher_name`。

### 6.9 解除会员爽约限制

#### POST /api/admin/members/{member_id}/clear-no-show

- **权限**：前台；**Body**：无。
- **响应**：`{ ok: true }`；清空限制日期，不删除历史爽约预约。

### 6.10 爽约记录

#### GET /api/admin/no-shows

- **权限**：只读；**请求**：无。
- **响应**：`{ items: Booking[] }`，仅 `no_show` 状态，按预约时间倒序。

### 6.11 升卡

#### POST /api/admin/cards/{card_id}/upgrade

- **权限**：前台。将正常卡升级为另一产品，原卡状态变为 `upgraded`，新卡继承新产品的有效期和权益，同时生成 `kind=upgrade` 的补差流水。

```json
{
  "product_id": 6,
  "price": 25712,
  "payment_method": "wechat",
  "starts_on": "2026-11-10",
  "note": "月卡补差升级年卡"
}
```

`price` 为本次补差金额，省略时按“新产品标价减原卡实购价、最低为 0”计算。仅支持同类别产品或年卡类别升级。响应包含 `old_card`、`card` 和 `difference`。新卡按新产品价格开卡，但不另生成全额购买流水；现金流水只记录本次补差金额。

### 6.12 转卡

#### POST /api/admin/cards/{card_id}/transfer

- **权限**：前台。将正常卡及剩余权益转给另一有效会员。
- **Body**：`target_member_id` 必填，`note` 可选；**响应**：更新后的 MemberCard。
- 若该卡仍关联未消课的 `booked` / `checked_in` 预约，返回 `400`，需先取消或完成对应预约。历史预约仍保留原会员归属。

### 6.13 共享会员卡

#### POST /api/admin/cards/{card_id}/share

- **权限**：前台；**Body**：`target_member_id`；**响应**：含最新 `shared_with` 的 MemberCard。
- 共享人预约和签到时可扣减原卡权益，预约记录仍归属实际到课的共享人。目标必须是另一有效会员，重复共享返回 `400`。

### 6.14 移除共享

#### DELETE /api/admin/cards/{card_id}/shares/{member_id}

- **权限**：前台；**Body**：无；**响应**：`{ ok: true }`。
- 共享人仍有该卡关联的未消课有效预约时返回 `400`，需先取消预约。历史核销记录不删除。

### 6.15 创建会员提醒

#### POST /api/admin/members/{member_id}/reminders

- **权限**：前台；**Body**：`content` 必填，`remind_on` 可选，留空表示立即提醒。

```json
{ "content": "会员生日准备了小礼物，签到时交给会员", "remind_on": "2026-11-16" }
```

到期提醒出现在会员详情 `reminder_alerts` 中，并在签到响应 `member_reminders` 中返回。生日前 7 天会自动生成提示，无需创建生日提醒。

### 6.16 修改或完成提醒

#### PATCH /api/admin/reminders/{reminder_id}

- **权限**：前台；传 `{ "active": false }` 完成提醒，或传非空 `content` 修改内容。
- **响应**：提醒对象，包含 `id`、`member_id`、`content`、`remind_on`、`active`、`created_by`、`created_at`。

### 6.17 发放免费体验券

#### POST /api/admin/members/{member_id}/vouchers

- **权限**：前台。发放可用于真实预约和消课的体验券。

```json
{ "course_type": "private", "quantity": 1, "expires_on": "2026-12-10", "note": "销售体验 offer" }
```

`course_type` 支持 `all`、`group`、`private`、`assessment`、`workshop`、`training`；`quantity` 为 1–100，默认 1；`expires_on` 默认为发放日起 30 天且不能早于当天。无可用会员卡时，签到会原子扣减体验券；取消签到或取消已消课预约会返还。响应及会员详情的 `vouchers` 包含总次数、剩余次数、状态、有效期和发券人。

### 6.18 停用或恢复体验券

#### PATCH /api/admin/vouchers/{voucher_id}

- **权限**：前台；**Body**：`status=cancelled` 停用，`status=active` 恢复。
- **响应**：更新后的体验券。停用不影响历史核销记录；恢复后仍受有效期和剩余次数限制。

### 6.19 读取单条会员记录

#### GET /api/admin/records/{record_id}

- **权限**：只读；**响应**：`id`、`record_type`、`title`、`content`、`record_date`、`teacher_id`、`teacher_name`。
- 已移入回收站的记录返回 `404`。

### 6.20 编辑会员记录

#### PATCH /api/admin/records/{record_id}

- **权限**：前台；**Body**：`teacher_id`、`record_type`、`title`、`content`、`record_date` 任意子集。
- **响应**：更新后的会员记录。标题不能为空，日期必须为 `YYYY-MM-DD`；删除使用第 16 章回收站接口。

## 7. 会员合同与评估文件（6）

### 7.1 文件列表

#### GET /api/admin/members/{member_id}/documents

- **权限**：只读；**响应**：`{ items: DocumentMeta[] }`；可用 `category=contract|assessment` 筛选。
- `DocumentMeta`：`id`、`category`、`original_name`、`content_type`、`size_bytes`、`uploaded_by`、`created_at`。

### 7.2 上传文件

#### POST /api/admin/members/{member_id}/documents

- **权限**：前台；**multipart**：字段 `file`，分类字段 `category=contract|assessment`，默认 `contract`。
- 支持 PDF、图片、Word、Excel、CSV，单文件最大 12 MiB，不允许空文件。
- **响应**：DocumentMeta。服务端以 UUID 重命名存储，响应不暴露存储路径。

### 7.3 下载文件

#### GET /api/admin/documents/{document_id}/download

- **权限**：只读；**响应**：原始文件流及附件文件名。
- 数据记录不存在、已在回收站或磁盘文件已移除均返回 `404`。

### 7.4 读取附件元数据

#### GET /api/admin/documents/{document_id}

- **权限**：只读；**响应**：DocumentMeta，不含存储路径和文件内容。

### 7.5 编辑附件名称与分类

#### PATCH /api/admin/documents/{document_id}

- **权限**：前台；**Body**：`original_name`、`category=contract|assessment` 任意子集。
- **响应**：更新后的 DocumentMeta。文件名必须保留允许的扩展名；此接口不替换文件内容。

### 7.6 附件移入回收站

#### DELETE /api/admin/documents/{document_id}

- **权限**：前台；**响应**：`{ ok, item, message }`。
- 记录和文件保留 180 天，期间不可列表或下载，可由管理员恢复；到期彻底删除见第 16 章。

## 8. 排课、预约、教室与目录（22）

### 8.1 查询后台排课

#### GET /api/admin/sessions

- **权限**：只读。
- **Query**：`date_from`、`date_to`（默认今日起 7 天）、`detailed`（默认 `false`）、`course_type`。
- **响应**：`{ items: ClassSession[] }`，包含已取消排课；`detailed=true` 时每节含预约名单。

### 8.2 新建排课

#### POST /api/admin/sessions

- **权限**：前台。
- **Body 必填**：`course_id`、`teacher_id`、`room_id`、`session_date`、`start_time`、`end_time`、`capacity`。
- **Body 可选**：`status`（默认 `scheduled`）、`notes`。
- **响应**：ClassSession（detailed）。结束时间必须晚于开始时间，容量至少 1，关联资料必须启用。
- 教练或教室时间重叠返回 `409`，与有效教室占用重叠也返回 `409`。

### 8.3 修改排课

#### PATCH /api/admin/sessions/{session_id}

- **权限**：前台；**Body**：新建接口字段的任意子集。
- **响应**：ClassSession（detailed）。服务端合并现有值后重新执行完整校验。
- 容量不能小于当前占位预约数；修改时间、教练或教室会重新检查冲突。

### 8.4 取消整节排课

#### DELETE /api/admin/sessions/{session_id}

- **权限**：前台；**Body**：无。
- **响应**：`{ ok, cancelled_bookings }`。
- 排课状态变为 `cancelled`；取消 `booked` 和历史 `checked_in` 预约，释放席位并返还已扣权益，再逐条发送取消通知。`completed`（含新签到即消课记录）和 `no_show` 记录不自动改动；如需撤销已消课预约，应先逐条执行 `undo_check_in`，再取消。

### 8.5 复制上一周课表

#### POST /api/admin/sessions/copy-week

- **权限**：前台；**Body**：`week_start`（目标周任意一天，复制源固定为该日期前 7 天起的 7 天）。
- **响应**：`{ ok, created, skipped }`，`skipped` 为逐项中文原因。
- 逐节复制到对应下周日期；重复、冲突或无效项跳过，不覆盖已有课程。

### 8.6 后台添加预约

#### POST /api/admin/sessions/{session_id}/bookings

- **权限**：前台；**Body**：`member_id` 必填，`notes` 可选。
- **响应**：Booking。
- 与会员预约共用容量、重复和状态校验，但不应用自助截止、爽约限制和“预约前必须有卡”的限制；签到时仍会校验卡。

### 8.7 预约状态操作

#### POST /api/admin/bookings/{booking_id}/{action}

- **权限**：前台；**Body**：无；路径 `action` 见下表。
- **响应**：更新后的 Booking；`check_in` 额外返回 `member_reminders: string[]`，包含已到期会员提醒及生日前 7 天提示。

| action | 允许原状态 | 结果与副作用 |
| --- | --- | --- |
| `check_in` | `booked` | 选择适用自有卡、共享卡或体验券并扣一次，直接变为 `completed`，同时写入签到和完成时间 |
| `undo_check_in` | `checked_in`、`completed` | 返还本次卡权益或体验券，清空签到/完成时间并回到 `booked` |
| `complete` | `booked`、`checked_in` | 兼容旧流程；未扣次则先扣一次，变为 `completed`，不重复扣 |
| `cancel` | `booked`、`checked_in`、`completed` | 返还已扣权益、释放席位，变为 `cancelled` 并发送短信 |
| `no_show` | `booked` | 变为 `no_show`，不扣次、不释放席位，并设置自助预约限制 |

卡选择按到期日、ID 升序，需活动、已生效、未过期、未冻结且权益适用；优先使用有效卡，无可用卡时才选择有效体验券。扣次与返还均使用版本号做并发校验。

### 8.8 教室某日总览

#### GET /api/admin/rooms/overview

- **权限**：只读；**Query**：`date`（默认今日）、`floor`（可选，按楼层精确筛选）。
- **响应**：`{ date, rooms }`；每个 Room 增加 `sessions` 和 `reservations`，教室按 `floor`、`sort_order`、`id` 排列。
- `reservations[]` 含 `id`、`room_id`、`title`、`reservation_date`、`start_time`、`end_time`、`usage_type`、`notes`；只包含启用教室、正常排课和有效占用。

### 8.9 创建教室占用

#### POST /api/admin/room-reservations

- **权限**：前台。
- **Body**：`room_id`、`reservation_date`、`start_time`、`end_time`、`title` 必填；`repeat_weeks`（1–52，默认 1）、`usage_type`（默认 `internal`）、`notes` 可选。
- **响应**：`{ ok, created, skipped }`。
- 按周重复时逐日检查课程和其他占用，冲突项跳过；用途标题不能为空。

### 8.10 取消教室占用

#### DELETE /api/admin/room-reservations/{reservation_id}

- **权限**：前台；**Body**：无。
- **响应**：`{ ok: true }`。软取消，不删除记录。

### 8.11 新建课程

#### POST /api/admin/courses

- **权限**：管理员。
- **Body**：Course 字段中的 `course_type`、`name`、`name_en`、`description`、`description_en`、`duration_minutes`、`price`、`color`、`image_url`、`active`；未在代码中额外强制必填，但业务上应提供类型和名称。
- **响应**：Course。

### 8.12 修改课程

#### PATCH /api/admin/courses/{course_id}

- **权限**：管理员；**Body**：与新建相同，部分更新。
- **响应**：Course；不存在返回 `404`。

### 8.13 新建教室

#### POST /api/admin/rooms

- **权限**：管理员；**Body**：`name`、`name_en`、`capacity`、`floor`、`sort_order`、`color`、`active`。
- **响应**：Room。`sort_order` 省略时按当前教室数量生成。

### 8.14 修改教室

#### PATCH /api/admin/rooms/{room_id}

- **权限**：管理员；**Body**：与新建相同，部分更新；**响应**：Room。

### 8.15 新建教练

#### POST /api/admin/teachers

- **权限**：管理员；**Body**：`user_id`、`name`、`name_en`、`phone`、`gender`、`specialties`、`specialties_en`、`bio`、`bio_en`、`image_url`、`visible`、`active`。
- **响应**：Teacher。

### 8.16 修改教练

#### PATCH /api/admin/teachers/{teacher_id}

- **权限**：管理员；**Body**：与新建相同，部分更新；**响应**：Teacher。

### 8.17 一步完成私教排课与预约

#### POST /api/admin/private-bookings

- **权限**：前台。一次事务中创建一节容量为 1 的私教/评估课程和会员预约，避免先排课再选会员的两步操作。

```json
{
  "course_id": 5,
  "teacher_id": 4,
  "room_id": 5,
  "member_id": 1,
  "session_date": "2026-11-20",
  "start_time": "09:00",
  "end_time": "10:00",
  "notes": "初次私教"
}
```

课程必须是 `private` 或 `assessment`，教练、教室冲突返回 `409`，课程已开始返回 `400`。成功响应包含 `session` 和 `booking`，任一失败则整体不保存。发送预约通知的规则与普通后台预约一致，保存后仍是 `booked`，签到时才扣次。

### 8.18 空排课移入回收站

#### DELETE /api/admin/sessions/{session_id}/permanent

- **权限**：前台；**Body**：无；**响应**：`{ ok, item, message }`。
- 路径名为历史兼容保留，实际执行软删除而非物理删除。仅从未产生任何预约的排课可通过此入口删除；已有预约（包括已取消预约）返回 `400`，应使用取消课程保留历史。恢复与到期彻底删除见第 16 章。

### 8.19 编辑教室占用

#### PATCH /api/admin/room-reservations/{reservation_id}

- **权限**：前台；**Body**：`room_id`、`title`、`reservation_date`、`start_time`、`end_time`、`usage_type`、`notes` 的任意子集。
- **响应**：`{ ok: true }`。省略字段沿用原值，保存前排除自身并检查课程及其他占用冲突；取消占用仍使用 DELETE 接口。

### 8.20 教室自定义排序

#### POST /api/admin/rooms/reorder

- **权限**：管理员。接收完整 `room_ids` 数组，按数组顺序写入 `sort_order`。

```json
{ "room_ids": [5, 1, 2, 3, 4] }
```

ID 必须覆盖当前全部教室且不能重复。列表和总览按楼层、自定义顺序和 ID 排列；此接口不修改 `floor`。

### 8.21 上传教练照片

#### POST /api/admin/teachers/{teacher_id}/photo

- **权限**：管理员；`multipart/form-data` 上传字段名为 `file`，支持 PNG、JPG、WebP，最大 4 MiB。
- **响应**：更新后的 Teacher。服务端校验真实文件头，`image_url` 为 `/uploads/teachers/...` 路径；上传文件需与数据库一起备份。

### 8.22 查询各教室指定时段占用

#### GET /api/admin/rooms/availability

- **权限**：只读；**Query**：`date`、`start_time`、`end_time` 必填，`exclude_session_id` 可选（编辑排课时排除自身）。
- **响应**：`{ date, start_time, end_time, rooms }`，按楼层和排序返回启用教室；每项在 Room 基础上增加 `available` 和 `conflicts`。
- `conflicts[]` 同时包含重叠课程和内部占用：`kind=class|reservation`、`title`、`title_en`、`teacher_name`、`teacher_name_en`、`start_time`、`end_time`。
- 结束时间必须晚于开始时间。此接口用于在排课编辑器中即时禁用并标注冲突教室；新建和修改排课仍会执行服务端最终冲突校验。

## 9. 产品、财务与报表（10）

### 9.1 产品列表

#### GET /api/admin/products

- **权限**：只读；**响应**：`{ items: CardProduct[] }`，包含停用产品。

### 9.2 新建产品

#### POST /api/admin/products

- **权限**：财务。
- **Body**：`name` 必填；`name_en`、`category`、`price`、`original_price`、`validity_days`、`total_sessions`、`benefits`、`description`、`description_en`、`online_sale`、`active` 可选。
- 价格不能为负，有效期至少 1 天；**响应**：CardProduct。

### 9.3 修改产品

#### PATCH /api/admin/products/{product_id}

- **权限**：财务；**Body**：与新建相同，部分更新。
- **响应**：CardProduct。修改不会自动重算已售出会员卡的权益、价格或有效期。

### 9.4 查询财务流水

#### GET /api/admin/transactions

- **权限**：只读。
- **Query**：`date_from`、`date_to`、`category`、`member_id`，均可选。
- **响应**：`{ items: Transaction[]（最多1000）, total_amount }`。
- `total_amount` 仅汇总结果中 `paid`、`refunded` 流水；`pending` 不计入。

### 9.5 手工入账

#### POST /api/admin/transactions/manual

- **权限**：财务。
- **Body**：`amount`（非零，必填）、`member_id`（可空）、`category`（默认 `misc`）、`payment_method`（默认 `cash`）、`note`。
- **响应**：`kind=manual`、`status=paid` 的 Transaction。不会自动开卡或修改权益。

### 9.6 退款

#### POST /api/admin/transactions/{transaction_id}/refund

- **权限**：财务；**Body**：`amount`（默认原单全额）、`note`。
- **响应**：新建的负数 `refund` 流水。
- 原单必须 `paid` 且金额为正；退款金额须大于 0 且不超过原单金额。
- 原单改为 `refunded`，不能再次退款，部分退款同样如此。若关联会员卡且全额退款，卡状态改为 `cancelled`；不会返还历史已消耗次数，也不会自动删除预约。

### 9.7 核销购卡电子码

#### POST /api/admin/orders/redeem

- **权限**：前台；**Body**：`redemption_code`，自动去空格并转大写。
- **响应**：`{ ok, card_id, order }`。
- 通过条件更新抢占 `pending` 原单，避免并发重复核销；随后开卡、原单改为 `paid`、关联 `member_card_id` 并记录核销时间，不重复入账。

### 9.8 综合经营报表

#### GET /api/admin/reports

- **权限**：只读；**Query**：`date_from`（默认本月 1 日）、`date_to`（默认今日）。
- **响应**：`range`、`summary`、`amortized_revenue`、`private_recognized_revenue`、`revenue_by_category`、`course_stats`、`teacher_stats`、`weekday`、`hour`、`room_usage`。
- `summary` 含 `revenue`（确认营收）、`cash_received`（现金实收）、`sessions`、`cancelled_sessions`、`attendees`、`booking_count`、`cancelled_bookings`。
- 现金实收按查询范围内 `paid` / `refunded` 流水净额计算，含负数退款；待核销订单不计入。确认营收不等于现金实收：
  - `category=annual|package|group` 且 `validity_days=365` 的产品，从卡 `starts_on` 起按 365 天直线分摊，取与查询范围重叠的天数；`amortized_revenue` 是这部分确认营收。
  - 私教购买和升卡流水只计现金，不提前确认营收；有效私教消课按“卡实购价 ÷ 卡总次数”确认，计入 `private_recognized_revenue`。取消签到后记录不再处于已消课状态，因此不再计入。
  - 其他已支付类别按流水发生时直接确认，退款负数流水按同一类别口径冲减。
- `revenue_by_category` 是 `{ label, value }[]`；课程统计含 `sessions`、`cancelled`、`attendees`、`bookings`，教练统计另含 `minutes`、`hours`。
- `weekday.label` 为 0–6（周一至周日），`hour.label` 为两位小时；`value` 是实际到课人次。
- 教室统计含 `used_hours`、`internal_hours`、`utilization`；利用率分母按范围内每天 12 小时计算。

### 9.9 编辑手工入账

#### PATCH /api/admin/transactions/{transaction_id}

- **权限**：财务；**Body**：`member_id`、`category`、`amount`、`payment_method`、`note` 任意子集。
- **响应**：更新后的 Transaction。只允许 `kind=manual`，金额不能为 0；购买、升卡和退款流水返回 `404`。

### 9.10 手工入账移入回收站

#### DELETE /api/admin/transactions/{transaction_id}

- **权限**：财务；**响应**：`{ ok, item, message }`。
- 只允许手工入账。删除后立即从流水、现金实收、确认营收和导出中排除，恢复后重新计入；购买、升卡和退款流水不可删除。

## 10. 场馆、品牌与账号（8）

### 10.1 读取系统设置

#### GET /api/admin/settings

- **权限**：管理员；**响应**：AppSettings。
- 字段：`venue_name`、`venue_name_en`、`address`、`address_en`、`phone`、`logo_url`、`favicon_url`、`booking_cutoff_minutes`、`no_show_block_days`、`reminder_hours`。

### 10.2 更新系统设置

#### PUT /api/admin/settings

- **权限**：管理员；**Body**：上述字段，但品牌 URL 不接受此接口修改。
- 自助截止 0–10080 分钟，爽约限制 0–365 天，提醒提前量 1–168 小时。
- **响应**：完整 AppSettings；未传字段保持原值。

### 10.3 上传 Logo / favicon

#### POST /api/admin/settings/branding/{kind}

- **权限**：管理员；路径 `kind` 为 `logo` 或 `favicon`；multipart 字段 `file`。
- 仅 PNG，最大 2 MiB；Logo 必须 256×256 像素，favicon 必须 64×64 像素。
- **响应**：AppSettings，对应 URL 带时间戳防止缓存。固定覆盖 `logo.png` 或 `favicon.png`。

### 10.4 恢复默认品牌图片

#### DELETE /api/admin/settings/branding/{kind}

- **权限**：管理员；**Body**：无。
- **响应**：AppSettings；清空对应 URL 并恢复默认图标，不物理删除服务器文件。此操作是品牌设置变更，不进入回收站。

### 10.5 员工账号列表

#### GET /api/admin/users

- **权限**：管理员；**响应**：`{ items: User[] }`，永不返回密码哈希。

### 10.6 新建员工账号

#### POST /api/admin/users

- **权限**：管理员。
- **Body**：`username`、`password` 必填；`full_name`、`phone`、`role`（默认 `viewer`）可选。
- 用户名为 3–30 位小写字母、数字、下划线，密码至少 8 位，角色必须是五种合法角色之一。
- **响应**：User；初始 `active=true`。

### 10.7 修改员工账号

#### PATCH /api/admin/users/{user_id}

- **权限**：管理员；**Body**：`role`、`full_name`、`phone`、`active`、`password` 任意子集。
- **响应**：User。新密码至少 8 位；不能停用当前登录的自己。
- 修改密码不会在此响应中返回密码，也不会吊销其他已登录 Token。

### 10.8 员工账号移入回收站

#### DELETE /api/admin/users/{user_id}

- **权限**：管理员；**响应**：`{ ok, item, message }`。
- 删除后账号立即不能登录，已签发 Token 也不能继续使用。不能删除当前登录账号或最后一个有效管理员；可由管理员恢复。

### 10.9 品牌静态文件

上传后的图片通过 `GET /uploads/branding/logo.png` 或 `GET /uploads/branding/favicon.png` 访问，属于静态资源而不是 `/api` 业务接口。实际使用时应采用 AppSettings 返回的带版本 URL。

## 11. 短信与审计日志（5）

### 11.1 读取短信配置

#### GET /api/admin/sms-settings

- **权限**：管理员；**响应**：SmsSettings 的安全视图。
- 字段：`enabled`、`sp_id`、`password_set`、`send_url`、`balance_url`、`signature_prefix`、`notify_booking`、`notify_cancel`、`notify_reminder`、`template_booking`、`template_cancel`、`template_reminder`。
- 不返回密码或 MD5，只通过 `password_set` 表示是否已配置。

### 11.2 更新短信配置

#### PUT /api/admin/sms-settings

- **权限**：管理员；**Body**：上述字段（除 `password_set`），密码使用 `password`。
- `password` 可传明文，服务端保存 MD5；也可直接传 32 位十六进制 MD5。空密码表示不修改。
- 模板开头不要重复写 `【签名】`，系统统一添加 `signature_prefix`；否则 `400`。
- **响应**：安全视图。

模板变量：`{name}`、`{course}`、`{date}`、`{time}`、`{room}`、`{teacher}`、`{id}`。通知开关和总开关共同决定是否真正发送；预约业务不会因通知失败而回滚。

### 11.3 发送连通性测试短信

#### POST /api/admin/sms-settings/test

- **权限**：管理员；**Body**：`phone`。
- **响应**：`ok`、`message`、`provider`、`content`；网关调用异常时 `ok=false` 并含 `error`，HTTP 仍可为 200。
- 调用前必须配置 `sp_id` 和密码；每次结果写入短信日志。此接口会真实调用第三方并可能产生费用。

### 11.4 查询短信余额

#### GET /api/admin/sms-settings/balance

- **权限**：管理员；**请求**：无。
- **响应**：`{ ok: true, provider }`，`provider` 原样为运营商响应。
- 配置缺失 `400`，网关请求异常 `502`。

### 11.5 操作 / 短信日志

#### GET /api/admin/logs

- **权限**：管理员。
- **Query**：`kind=operation|sms`（默认 `operation`）、`page`（≥1）、`q`（操作人用户名或短信手机号模糊搜索）。
- **响应**：`{ items, total, page, page_size: 50 }`。
- 操作日志项：`id`、`created_at`、`actor_username`、`actor_role`、`category`、`action`、`entity`、`entity_id`、`detail_json`。
- 短信日志项：`id`、`created_at`、`purpose`、`phone`、`booking_id`、`content`、`status`、`reason`、`provider_json`。两个 JSON 字段当前是字符串，不是已解析对象。

### 11.6 自动通知说明

预约成功、取消和课前提醒没有独立“立即发送”业务 API，分别由预约/取消接口和后台调度任务触发。提醒只处理 `booked`，按 `reminder_hours` 时间窗筛选，并依据短信日志避免同一预约重复提醒。

## 12. API Key 管理与调用日志（6）

> 本组接口仅允许管理员 JWT 登录会话，不接受 API Key 调用，防止凭证自我提权或轮换其他凭证。任何响应都不会返回 `key_hash`。

**ApiKey 安全视图**包含：`id`、`name`、`key_prefix`、`key_suffix`、`masked_key`、`scopes`、`active`、`expired`、`expires_at`、`created_by`、`creator_name`、`created_at`、`updated_at`、`rotated_at`、`last_used_at`、`last_used_ip`、`usage_count`。`expires_at`、未发生的时间字段为 `null`；`last_used_ip` 未使用时为空字符串。

有效期可传 `YYYY-MM-DD`（当天 23:59:59 到期）、`YYYY-MM-DDTHH:MM` 或带秒的本地 ISO 时间，不支持时区后缀；必须晚于服务器当前时间。传 `null`、空字符串或 `never` 表示永不过期，创建时省略该字段则默认 90 天。

### 12.1 API Key 列表与权限选项

#### GET /api/admin/api-keys

- **权限**：管理员登录会话；**请求**：无。
- **响应**：`{ items: ApiKey[], scope_options }`，按 ID 倒序。
- `scope_options[]` 含 `id`、`description`，覆盖 1.4 节全部 8 种 scope；列表只返回掩码，不能用于取回完整密钥。

### 12.2 创建 API Key

#### POST /api/admin/api-keys

- **权限**：管理员登录会话。
- **Body**：`name`（1–100 字符）、`scopes`（至少一个有效 scope 的数组）、`expires_at`（可选，规则见本节开头）。
- **响应**：`{ item, api_key, message }`。`api_key` 是唯一一次返回的完整明文，必须立即安全保存。
- 新凭证默认 `active=true`，创建人为当前管理员；操作写入普通审计日志。

```json
{
  "name": "CRM 数据同步",
  "scopes": ["read"],
  "expires_at": "2027-01-31T23:59:59"
}
```

### 12.3 修改名称、权限、有效期或启停

#### PATCH /api/admin/api-keys/{key_id}

- **权限**：管理员登录会话。
- **Body**：`name`、`scopes`、`expires_at`、`active` 任意子集；未传字段保持不变。
- **响应**：ApiKey 安全视图，不返回完整密钥。
- 停用后下一次调用立即返回 `401`；将 `expires_at` 改为 `null` 会变为永不过期，应谨慎使用。

### 12.4 轮换 API Key

#### POST /api/admin/api-keys/{key_id}/rotate

- **权限**：管理员登录会话；**Body**：无。
- **响应**：`{ item, api_key, message }`，新完整明文仅本次返回。
- 原密钥立即失效，名称、scopes、有效期和 active 状态保持不变；`rotated_at` 更新。不会自动启用已停用密钥。

### 12.5 删除 API Key

#### DELETE /api/admin/api-keys/{key_id}

- **权限**：管理员登录会话；**Body**：无。
- **响应**：`{ ok, item, message }`；移入回收站后调用返回 `401`。
- 使用日志保留当时的密钥 ID、名称和前缀快照。管理员可在回收站恢复，满 180 天后才可彻底删除。

### 12.6 查询 API Key 使用日志

#### GET /api/admin/api-key-logs

- **权限**：管理员登录会话。
- **Query**：`key_id`（0 表示全部）、`result=all|success|denied`、`page`（≥1）、`q`（按密钥名称、路径或 IP 模糊搜索）。
- `success` 为状态码小于 400，`denied` 为状态码大于等于 400。
- **响应**：`{ items, total, page, page_size: 20 }`，按日志 ID 倒序。
- 日志项：`id`、`api_key_id`、`key_name`、`key_prefix`、`method`、`path`、`status_code`、`ip`、`user_agent`、`created_at`。
- 无效或过期密钥的拒绝请求也会记录；路径不含 Query String，日志中不会出现完整密钥。

## 13. 数据导出、备份与恢复（10）

> 以下接口均需管理员。备份工具只支持 SQLite 文件数据库；数据库备份不包含 `/uploads` 中的合同、Logo 等文件，完整灾难恢复还需另行备份上传目录。

### 13.1 立即一致性备份

#### POST /api/admin/maintenance/backup-db

- **Body**：无；使用 SQLite Online Backup API 生成一致性快照。
- **响应**：`{ ok, filename, size_bytes, message }`；随后按保留计划清理旧备份。

### 13.2 备份列表

#### GET /api/admin/maintenance/backups

- **请求**：无。
- **响应**：`{ items }`，每项含 `filename`、`size_bytes`、`modified_at`，按修改时间倒序。

### 13.3 下载备份

#### GET /api/admin/maintenance/backups/download

- **Query**：`filename` 必填，只能是备份目录内的 `.db` 文件名，不允许路径跳转。
- **响应**：`application/octet-stream` 文件流；不存在返回 `404`。

### 13.4 从已有备份恢复

#### POST /api/admin/maintenance/restore-db/from-backup

- **Query**：`filename`；**Body**：无。
- **响应**：`{ ok, before_backup, message }`。
- 校验 SQLite 文件头、完整性和 `members` 表，恢复前自动备份当前库；成功后需重新登录并重启后端。

### 13.5 上传数据库并恢复

#### POST /api/admin/maintenance/restore-db/upload

- **multipart**：`file`，必须为 `.db`，最大 100 MiB。
- **响应与规则**：同从已有备份恢复。
- 上传副本保留在备份目录。恢复是高风险全量覆盖操作，不可当作普通导入重复调用。

### 13.6 读取自动备份计划

#### GET /api/admin/maintenance/backup-plan

- **请求**：无。
- **响应**：`enabled`、`daily_time_hm`、`keep_last`、`last_run_date`。

### 13.7 更新自动备份计划

#### PUT /api/admin/maintenance/backup-plan

- **Body**：`enabled`、`daily_time_hm`（`HH:MM`）、`keep_last`，均可选。
- 保留份数被限制在 1–3650；保存后立即清理超出份数的旧备份。
- **响应**：`ok` 加完整计划字段。

### 13.8 导出 CSV

#### GET /api/admin/maintenance/export/{kind}.csv

- 路径 `kind`：`members`、`bookings`、`transactions`；其他值 `404`。
- **响应**：带 UTF-8 BOM 的 `text/csv`，可直接用 Excel 打开；导出全部记录，无日期筛选。
- 会员列：`id,name,name_en,phone,gender,birth_date,source,wechat,emergency_phone,notes,created_at`。
- 预约列：`id,member,phone,course,teacher,room,date,start_time,end_time,status,source,booked_at,cancelled_at,cancelled_by`。
- 流水列：`id,member,category,kind,amount,payment_method,status,occurred_at,note,redemption_code`。

### 13.9 下载会员导入模板

#### GET /api/admin/maintenance/members-template.csv

- **请求**：无；**响应**：UTF-8 BOM CSV。
- 列：`name,name_en,phone,gender,birth_date,source,wechat,emergency_phone,notes`，含一行示例。

### 13.10 导入会员 CSV

#### POST /api/admin/maintenance/members/import.csv

- **Query**：`duplicate_strategy=skip|update`，默认 `skip`。
- **multipart**：`file`，最大 5 MiB，编码必须 UTF-8 / UTF-8 BOM。
- **响应**：`{ ok, created, updated, skipped, error_count, errors }`，最多返回前 100 条行级错误。
- 姓名和手机号逐行校验；`skip` 跳过同手机号，`update` 用 CSV 字段覆盖已有会员。错误行跳过，其余有效行仍提交。

## 14. 典型业务调用顺序

### 14.1 会员预约闭环

```text
GET  /api/public/bootstrap
GET  /api/public/sessions?date_from=2026-01-01&date_to=2026-01-07
POST /api/public/auth/send-code
POST /api/public/auth/login                 -> 保存会员 Token
POST /api/public/bookings                   -> booked，占 1 席，不扣次
GET  /api/public/me                         -> 刷新预约、卡和流水
DELETE /api/public/bookings/{booking_id}     -> cancelled，释放席位
```

### 14.2 前台签到与消课闭环

```text
POST /api/admin/members                              -> 建立唯一手机号档案
POST /api/admin/members/{member_id}/cards             -> 开卡 + purchase 流水
POST /api/admin/sessions                              -> scheduled 排课
POST /api/admin/sessions/{session_id}/bookings         -> booked，占 1 席，不扣次
POST /api/admin/bookings/{booking_id}/check_in         -> completed，扣 1 次并返回到店提醒
GET  /api/admin/members/{member_id}                    -> 核对卡、共享卡、预约、体验券和流水
GET  /api/admin/reports                                -> 到课、现金实收与确认营收
```

误签到使用 `undo_check_in` 返回 `booked` 并返还权益，误预约使用 `cancel` 释放席位；不要通过直接调整剩余次数掩盖状态错误。新流程不需要再调用 `complete`，该动作仅为旧数据兼容保留。

### 14.3 电子码购卡闭环

```text
会员：POST /api/public/orders                  -> pending + redemption_code
前台：POST /api/admin/orders/redeem            -> paid + card_id，只核销一次
核对：GET  /api/admin/members/{member_id}
财务：GET  /api/admin/transactions?member_id=<id>
退款：POST /api/admin/transactions/{transaction_id}/refund
```

全额退款会销整张关联卡；调用方在确认框中必须明确提示。部分退款不会销卡，但原单也不可再次退款。

### 14.4 私教与会员权益闭环

```text
POST /api/admin/members/{member_id}/vouchers           -> 发放体验券（可选）
POST /api/admin/private-bookings                       -> 私教排课 + booked 预约，容量 1
POST /api/admin/bookings/{booking_id}/check_in         -> completed，扣自有卡/共享卡/体验券
POST /api/admin/bookings/{booking_id}/undo_check_in    -> booked，返还本次权益
POST /api/admin/cards/{card_id}/share                  -> 添加家庭共享成员
POST /api/admin/cards/{card_id}/upgrade                -> 原卡 upgraded + 新卡 + 补差流水
POST /api/admin/cards/{card_id}/transfer               -> 无未消课预约时转移剩余权益
GET  /api/admin/members/{member_id}                    -> 核对全部权益与到期提醒
```

签到优先选择有效自有卡或共享卡，无可用卡才使用体验券。升卡只记录补差流水；转卡和移除共享前应先处理该卡关联的未消课预约。

### 14.5 JavaScript 请求示例

```js
async function api(path, { method = "GET", token, apiKey, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers["X-API-Key"] = apiKey;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}

const login = await api("/api/auth/login", {
  method: "POST",
  body: { username: "your_username", password: "your_password" }
});
const sessions = await api(
  "/api/admin/sessions?date_from=2026-01-01&date_to=2026-01-07&detailed=true",
  { token: login.access_token }
);

const dashboard = await api("/api/admin/dashboard", {
  apiKey: process.env.WELLNESS_API_KEY
});
```

下载文件时不要使用会强制 `response.json()` 的封装；应读取 `response.blob()`，并保留 Authorization 请求头。

## 15. 对接检查清单

- 员工与会员 Token 分开存储，不用 Query String 传 Token 或 API Key；系统对接使用 `X-API-Key`。
- API Key 按最小权限分配 scopes 和有效期，完整明文只保存在安全的密码管理器中；泄露或员工离职时立即轮换、停用或删除，并定期检查使用日志。
- 不在前端信任 `available`、卡余额或角色，最终校验始终以服务端响应为准。
- 预约、签到、核销后重新读取关联资源，不自行累加金额或次数。
- 对 `400/409` 展示具体原因；只有网络中断等明确可重试场景才考虑重试。
- 对预约、购卡核销、退款、恢复数据库等写操作提供用户确认，避免重复点击。
- 生产环境更换默认 JWT 密钥、停用演示数据与开发验证码，并限制文档和后台的公网访问。
- 密钥、短信密码、数据库和合同文件不得提交到前端代码或公开仓库。
- 备份数据库的同时备份上传目录，并定期实际验证恢复流程。

## 16. 回收站与 180 天保留（4）

回收站资源标识：`users`、`members`、`teachers`、`rooms`、`courses`、`sessions`、`products`、`cards`、`bookings`、`shares`、`vouchers`、`reminders`、`room-reservations`、`records`、`documents`、`transactions`、`api-keys`。

删除接口按调用者当前角色和资源写入权限校验；读取回收站、恢复和彻底删除仅允许管理员 JWT 会话。`RecycleItem` 包含 `id`、`resource`、`resource_label`、`title`、`subtitle`、`deleted_at`、`deleted_by`、`days_in_recycle`、`purge_after`、`can_purge`。

### 16.1 查询回收站

#### GET /api/admin/recycle

- **权限**：管理员登录会话；**Query**：`resource`（可选资源标识）、`q`（按名称、说明、删除人或类型搜索）。
- **响应**：`{ items: RecycleItem[], total, retention_days: 180 }`，按删除时间倒序，最多返回 500 条。

### 16.2 移入回收站

#### DELETE /api/admin/recycle/{resource}/{entity_id}

- **权限**：管理员，或具有该资源写入权限的前台/财务角色；不接受 API Key。
- **响应**：`{ ok, item, message }`。已删除或不存在返回 `404`，关联业务或角色限制返回 `400` / `403`。
- 课程、教室、教练、产品、会员、会员卡、共享、提醒、体验券、会员记录、附件、手工入账等按第 1.7 节规则软删除。

### 16.3 恢复数据

#### POST /api/admin/recycle/{resource}/{entity_id}/restore

- **权限**：管理员登录会话；**Body**：无；**响应**：`{ ok, message }`。
- 恢复删除前的 `active`、`status`、`visible` 状态，并重新检查所属会员/教室、共享唯一性、排课及教室时段冲突；冲突返回 `400` 或 `409`，不会强行恢复。

### 16.4 到期彻底删除

#### DELETE /api/admin/recycle/{resource}/{entity_id}/permanent

- **权限**：管理员登录会话；**Body**：无；**响应**：`{ ok, message }`。
- 只有服务器确认删除时间已满 180 天才执行，提前返回 `400` 和可删除时间。外键关联未清理时返回 `409`。
- 合同/评估附件会同时删除磁盘文件；其他业务记录删除后不可恢复，操作写入审计日志。
