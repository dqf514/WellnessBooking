# 音昱 Wellness API 对接文档

> 版本：API v1.0.0 · 基于 FastAPI · 本文覆盖当前后端全部 **151 个 HTTP 接口**。
>
> 文档更新：2026-11-26 · 功能基线：预约排课、动态二维码签到、购卡申请取消、会员权益与营收业务闭环、角色能力矩阵与课程库独立接口、勤鸟历史数据导入。
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

| 文档权限标记 | 对应能力 | 可访问角色 / 身份 |
| --- | --- | --- |
| 公开 | — | 不需要 Token |
| 会员 | — | 有效会员 Token |
| 员工 | — | 任意有效员工 Token，用于 `/api/auth/me`、修改自己的密码 |
| 只读 | `dashboard.view`、`bookings.view`、`members.view`、`catalog.view` | `admin`、`frontdesk`、`finance`、`teacher`、`viewer` |
| 前台 | `bookings.write`、`members.write`、`cards.write`、`records.write` | `admin`、`frontdesk` |
| 财务 | `products.write`、`finance.write` | `admin`、`finance` |
| 管理员 | `settings.write` | 仅 `admin` |

权限在服务端强制执行，隐藏前端菜单并不等于接口授权。`teacher` 和 `viewer` 虽可读取业务数据，但不能执行写操作。

### 1.4 角色能力矩阵

服务端按“能力”而不是“角色名”判断权限。`backend/app/permissions.py` 是全系统唯一的角色→能力定义处，后台菜单、路由守卫、按钮显隐与接口鉴权共用同一份矩阵。登录响应与 `GET /api/auth/me` 会在 `user.capabilities` 中下发当前账号实际拥有的能力，调用方可据此渲染界面。

| 能力 | 说明 | 管理员 | 财务 | 前台 | 教练 | 只读 |
| --- | --- | --- | --- | --- | --- | --- |
| `dashboard.view` | 查看今日课程、预约与本月营收概览 | ✓ | ✓ | ✓ | ✓ | ✓ |
| `bookings.view` | 查看团课、私教与工作坊的预约名单 | ✓ | ✓ | ✓ | ✓ | ✓ |
| `bookings.write` | 新建排课、代客预约、签到、取消与爽约处理 | ✓ | — | ✓ | — | — |
| `members.view` | 查看会员档案、卡权益与跟进记录 | ✓ | ✓ | ✓ | ✓ | ✓ |
| `members.write` | 新建与修改会员资料、附件与爽约限制 | ✓ | — | ✓ | — | — |
| `records.write` | 书写私教与跟进记录 | ✓ | — | ✓ | ✓ | — |
| `cards.write` | 延期、冻结、转卡、共享与体验券管理 | ✓ | — | ✓ | — | — |
| `revenue.write` | 购卡、升额、电子码核销与消课营收确认 | ✓ | ✓ | ✓ | — | — |
| `catalog.view` | 查看课程、教练与教室目录 | ✓ | ✓ | ✓ | ✓ | ✓ |
| `catalog.write` | 维护课程、教练与教室资料 | ✓ | — | — | — | — |
| `products.view` | 查看卡课产品与价格 | ✓ | ✓ | ✓ | — | ✓ |
| `products.write` | 新建与修改卡课产品 | ✓ | ✓ | — | — | — |
| `finance.view` | 查看收支流水与对账单 | ✓ | ✓ | — | — | ✓ |
| `finance.write` | 手工入账、修改与退款 | ✓ | ✓ | — | — | — |
| `reports.view` | 查看经营报表与营收构成 | ✓ | ✓ | ✓ | — | ✓ |
| `recycle.write` | 将数据移入回收站 | ✓ | ✓ | ✓ | — | — |
| `recycle.view` | 查看与恢复回收站数据 | ✓ | — | — | — | — |
| `settings.view` | 查看账号、短信、密钥与日志 | ✓ | — | — | — | — |
| `settings.write` | 维护账号、短信、品牌与系统设置 | ✓ | — | — | — | — |

要点：

- 移入回收站按资源类型校验，只能删除自己具备写入能力的资源（见第 16 节）；读取回收站、恢复和彻底删除仅管理员可用。
- API Key 的实际权限是“密钥 scopes”与“创建人当前角色能力”的交集，两者任一不满足即返回 `403`。
- 少数入口按“满足其中一项能力”开放：财务入账页面对具备 `finance.view` 的角色返回完整流水，对仅有 `revenue.write` 的前台只提供电子码核销。
- 完整矩阵可通过 `GET /api/admin/role-permissions` 查询（管理员）。

### 1.5 API Key 接入鉴权

系统对接可在“系统设置 → API 密钥”创建独立凭证，调用后台接口时发送：

```http
X-API-Key: <完整 API Key>
```

- 密钥以 `yyk_` 开头，服务端只保存 SHA-256 哈希；完整明文仅在创建或轮换响应中返回一次，之后只能查看 `前缀…后四位`。
- 不要把密钥放在 URL、前端代码或公开仓库中。`Authorization: Bearer` 与 `X-API-Key` 不能同时使用，否则返回 `400`。
- API Key 复用创建人的员工身份，实际权限是“创建人当前角色允许范围”和“密钥 scopes”的交集。创建人停用后密钥立即不可用，角色降级也会进一步受限。
- 无效、停用、过期或已删除密钥返回 `401`；角色或 scope 不足返回 `403`。写操作不会因为有 `read` 而自动获得权限。
- API Key 仅用于 `/api/admin` 业务接口，不能访问会员个人接口、查询员工身份、修改密码，也不能管理 API Key；密钥管理只接受管理员 JWT 登录会话。
- `GET /api/admin/role-permissions` 属于系统内部权限信息，即使只读 scope 也不返回，需 `settings:write`。
- 每次携带 `yyk_` 前缀密钥的请求都会记录方法、路径、状态码、IP、User-Agent 和时间，日志不记录完整密钥或 Query String。

| scope | 权限范围 |
| --- | --- |
| `read` | 后台业务数据、报表与普通操作/短信日志读取 |
| `members:write` | 会员、会员卡、会员记录（含 `PATCH /api/admin/records/{id}`）、爽约限制、合同文件与会员群发通知写入 |
| `bookings:write` | 后台添加预约、签到、取消签到、完成、取消和爽约 |
| `schedule:write` | 排课、复制周课表、教室占用与 Outlook 日历导入写入 |
| `catalog:write` | 课程、教室和教练基础资料写入 |
| `finance:write` | 产品、手工入账、退款、电子码核销、会员卡升额与私教消课营收入账 |
| `settings:write` | 场馆、品牌、员工账号与短信设置写入 |
| `maintenance:write` | 数据导入导出、备份和恢复 |

```bash
curl "$API/api/admin/dashboard" -H "X-API-Key: $WELLNESS_API_KEY"
```

### 1.6 错误与并发

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

### 1.7 分页、筛选与 CORS

- 操作/短信日志固定每页 50 条，API Key 使用日志固定每页 20 条，`page` 均从 1 开始。
- 财务流水按时间倒序最多返回 1000 条；其他列表当前没有分页参数。
- 会员端课表单次跨度最多 31 天；后台课表不限制跨度，但调用方应主动控制范围。
- 开发环境 CORS 仅允许 `127.0.0.1` / `localhost` 的 `38733`、`38735` 端口；生产跨域部署需调整服务端 CORS 配置。

### 1.8 回收站与数据保留

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
| `capabilities` | string[] | 当前角色拥有的能力清单，见第 1.4 节 |
| `active` | boolean | 是否启用 |
| `created_at` | string | 创建时间 |

### 2.2 Member 会员

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id`、`name`、`name_en`、`phone` | integer / string | ID、中英文名、11 位手机号 |
| `gender`、`id_number`、`birth_date` | string | 性别、证件号、出生日期 |
| `source`、`advisor_id`、`advisor_name` | string / integer / null | 来源、会籍员工 ID 和姓名 |
| `emergency_phone`、`wechat`、`notes` | string | 紧急电话、微信、备注 |
| `photo_url` | string | 会员照片地址（`/uploads/members/...`），未上传时为空字符串 |
| `no_show_blocked_until` | string | 自助预约限制截止日，无限制为空字符串 |
| `active` | boolean | 是否允许登录与预约 |
| `created_at` | string | 建档时间 |
| `cards` | MemberCard[] | 仅明确标注“含 cards”的接口返回 |

### 2.3 Course、Teacher、Room

**Course**：`id`、`course_type`、`name`、`name_en`、`description`、`description_en`、`duration_minutes`、`price`、`color`、`image_url`、`active`。

**Teacher**：`id`、`user_id`、`name`、`name_en`、`phone`、`gender`、`specialties`、`specialties_en`、`bio`、`bio_en`、`image_url`、`visible`、`active`。

`user_id` 为关联的员工账号（角色为 `teacher`），用于让教练用自己的账号登录系统；未关联时为 `null`。同一员工账号只能关联一位教练。

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
| `frozen_from`、`frozen_until` | string | 冻结开始日与截止日，未冻结为空字符串；冻结区间内不消耗权益 |
| `is_renewal` | boolean | 是否为续卡（重新购卡）开的卡 |
| `start_pending` | boolean | 开卡日期待定：卡已生效可预约，首次签到当天自动开卡并按产品有效期顺延 |
| `note` | string | 操作备注 |
| `version` | integer | 乐观锁版本号，每次成功更新后加一 |
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

**Booking**：`id`、`session_id`、`member_id`、`member`、`member_card_id`、`experience_voucher_id`、`card_name`、`consumption_amount`、`status`、`source`、`booked_at`、`cancelled_at`、`cancelled_by`、`checked_in_at`、`completed_at`、`consumed`、`notes`；除嵌套在排课详情中时，还包含完整 `session`。使用体验券消课时 `card_name` 为“免费体验券”；`consumption_amount` 是“卡实购价 ÷ 总次数”的建议消课营收，无可用卡次数时为 0。

预约状态为 `booked`（待上课）、`checked_in`（历史已签到状态）、`completed`（已签到消课）、`cancelled`（已取消）、`no_show`（爽约）。来源为 `public` 或 `admin`。新签到直接写入 `completed`；`consumed=true` 表示已经扣除一次卡或体验券权益，重复完成不会再次扣减。

### 2.6 Transaction 财务流水

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id`、`member_id`、`member_card_id`、`product_id`、`booking_id` | integer / null | 关联资源 ID；消课营收通过 `booking_id` 关联预约 |
| `member_name`、`product_name`、`product_name_en` | string | 展示名称 |
| `category` | string | `group` / `private` / `annual` / `workshop` / `training` / `enterprise` / `misc`；历史 `assessment`、`package` 展示时分别归入 `private`、`annual` |
| `kind` | string | `purchase` / `manual` / `refund` / `upgrade` / `consumption` / `consumption_reversal` |
| `amount` | number | 入账为正，退款或冲销为负 |
| `payment_method` | string | 结账方式，例如 `cash`、`wechat`、`alipay`、`fitness_member`（健身会员） |
| `status` | string | `pending` / `paid` / `cancelled` / `refunded` |
| `cash_basis` | boolean | 是否计入现金流水；历史数据默认为 `true` |
| `revenue_mode` | string | `none`（不计营收）/ `immediate`（即时营收）/ `amortized`（每日均摊）/ `legacy`（历史规则） |
| `revenue_start_on`、`revenue_days` | string / integer | 每日均摊开始日期和天数 |
| `revenue_sequence` | integer | 同一预约第几次消课营收周期，配合唯一索引防止重复入账 |
| `created_by` | string | 入账员工显示名 |
| `occurred_at` | string | 业务发生时间 |
| `note` | string | 备注 |
| `redemption_code` | string / null | 线上购卡电子码 |
| `redeemed_at` | string / null | 核销时间 |
| `cancelled_at`、`cancelled_by` | string / null | 购卡申请取消时间与操作来源 |
| `is_renewal` | boolean | 是否为续卡流水（续卡即重新购卡） |

线上申请初始为 `pending`，核销后原单改为 `paid`，不会再新增一条购买流水。待核销申请可取消为 `cancelled`，电子码保留用于审计但立即失效；取消不开卡、不计实收。退款会新增负数 `refund` 流水，原正数单改为 `refunded`。私教/评估消课营收使用 `consumption`，取消签到或取消已消课预约会自动新增对应 `consumption_reversal`，不删除历史。

## 3. 健康检查与员工认证（9）

### 3.1 服务健康检查

#### GET /api/health

- **权限**：公开；**请求**：无。
- **响应**：`{ "ok": true, "service": "wellness-booking" }`。
- 只表示 HTTP 服务可响应，不替代数据库、短信网关或磁盘备份检查。

### 3.2 登录图片验证码

#### GET /api/auth/captcha

- **权限**：公开；**请求**：无。
- **响应**：`{ captcha_id, image, expires_in }`，`image` 是 `data:image/png;base64,` 开头的图片。
- 4 位字符（去掉 0/O/1/I 等易混字符），带旋转、干扰线与噪点；5 分钟过期，一次一用，同一张图最多尝试 5 次。
- 后台“登录安全”里关闭“登录需要图片验证码”后，登录接口不再校验该字段。

### 3.3 员工账号密码登录

#### POST /api/auth/login

- **权限**：公开。
- **Body**：`username`（string，必填）、`password`（string，必填）、`captcha_id`（string，启用图片验证码时必填）、`captcha_text`（string，启用图片验证码时必填，4 位）。
- **响应**：
  - 正常登录：`{ access_token, user }`，`user` 为 User。
  - 开启二次验证（MFA）时：`{ mfa_required: true, mfa_token, phone_masked }`，短信通道关闭的本地演示环境额外返回 `dev_code`；此时不返回 `access_token`。
- 用户不存在、密码错误或账号停用均返回 `400 用户名或密码错误`；验证码错误返回 `400 图片验证码错误或已过期，请点击图片刷新`。
- 开启二次验证后，账号未绑定手机号返回 `400 该账号未绑定手机号，无法完成二次验证，请联系管理员`。

```bash
curl -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"your_username","password":"your_password","captcha_id":"...","captcha_text":"AB3C"}'
```

### 3.4 员工登录二次验证（MFA）

#### POST /api/auth/login-mfa

- **权限**：公开；**Body**：`mfa_token`（string，取自密码登录响应）、`code`（string，短信验证码）。
- **响应**：`{ access_token, user }`，与密码登录一致。
- 挑战令牌 5 分钟过期，最多尝试 5 次；验证码错误或过期返回 `400 验证码错误或已过期`。

### 3.5 员工短信验证码

#### POST /api/auth/sms/send-code

- **权限**：公开；**Body**：`phone`。
- 手机号必须匹配已启用的员工账号，否则 `400`。
- **响应**：`{ ok, message, dev_mode }`；本地演示且短信关闭时额外返回 `dev_code`。
- 验证码 5 分钟有效，60 秒内不可重发，最多尝试 5 次；新验证码会使旧验证码失效。

### 3.6 员工短信登录

#### POST /api/auth/login-sms

- **权限**：公开；**Body**：`phone`、`code`。
- **响应**：同密码登录。短信用途独立为 `staff_login`。

### 3.7 当前员工

#### GET /api/auth/me

- **权限**：员工；**请求**：无 Body。
- **响应**：User 对象，不含 `access_token` 和密码。

### 3.8 修改自己的资料

#### PATCH /api/auth/me

- **权限**：员工登录会话（API Key 不支持）；**Body**：`full_name`、`phone` 任意子集。
- `full_name` 不能为空；`phone` 需为 11 位手机号，且不能与其他员工账号重复。
- **响应**：更新后的 User 对象。任何角色都可以修改自己的姓名与绑定手机号；登录名、角色与密码需走专门接口。

### 3.9 修改自己的密码

#### POST /api/auth/change-password

- **权限**：员工；**Body**：`old_password`、`new_password`。
- 新密码至少 8 位；原密码错误返回 `400`。
- **响应**：`{ "ok": true }`。只更新当前 Token 对应员工。

## 4. 会员端接口（19）

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
- 带会员令牌（`Authorization: Bearer member:<id>`）访问时，每节课额外返回 `booked` 布尔值，表示该会员是否已有有效预约；匿名访问时该字段恒为 `false`。

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

### 4.10 获取会员动态签到码

#### GET /api/public/me/check-in-code

- **权限**：会员；**请求**：无。
- **响应**：`{ token, expires_at, expires_in, refresh_after }`；`token` 以 `YYM1.` 开头，`expires_at` 为 Unix 秒时间戳。
- 二维码内容由前端根据 `token` 生成，不把会员手机号写入码中。签名用途与登录 JWT 不同，码有效期 60 秒，建议每 30 秒重新获取。

### 4.11 会员扫描课程码自助签到

#### POST /api/public/check-in/scan

- **权限**：会员，只能签到自己的预约；**Body**：`{ token }`，`token` 为前台课程码的完整 `YYS1....` 内容。
- **响应**：最新 Booking，并增加 `already_checked_in`、`check_in_method=session_code`、`member_reminders=[]`。
- 仅接受签名有效且未过期的课程码；会员必须有该课程的 `booked` / `checked_in` / `completed` 预约。其他会员无法使用同一预约签到。
- 开课前 30 分钟至课程结束可签到；重复扫码返回 `already_checked_in=true`，不会再次扣次。

```json
{ "token": "YYS1.eyJzaWQiOjM5LCJleHAiOjE3OTQzNjAwMDB9.signature" }
```

### 4.12 取消待核销购卡申请

#### DELETE /api/public/orders/{order_id}

- **权限**：会员，只能取消自己的待核销申请；**Body**：无。
- **响应**：取消后的 Transaction，`status=cancelled`，包含 `cancelled_at`、`cancelled_by=会员自主取消`。
- 仅 `pending` 可取消；他人订单返回 `404`，已核销或已取消订单返回 `400`，并发状态变化返回 `409`。
- 取消采用条件原子更新，与电子码核销互斥。取消后原电子码永久失效，不开卡、不计实收、不删除历史记录；重复取消不会成功。

### 4.13 会员自助修改姓名与生日

#### PATCH /api/public/me/profile

- **权限**：会员，只能修改自己的资料；**Body**：`{ name?, birth_date? }`。
- **响应**：更新后的 `member`。
- 姓名为空或超过 40 字返回 `400`；生日需为 `YYYY-MM-DD` 格式，不得晚于今天，且不得超出 120 年。
- 提交空生日表示清空生日。手机号不在此接口维护，需走 4.14、4.15 的双验证码流程。
- 修改会写入操作日志（`member / update_profile`）。

### 4.14 发送换号验证码

#### POST /api/public/me/phone/code

- **权限**：会员；**Body**：`{ phone, purpose }`，`purpose` 取 `current`（原手机号）或 `new`（新手机号）。
- **响应**：与登录验证码一致 `{ ok, message, dev_mode, dev_code? }`，`dev_code` 仅在本地演示模式返回。
- 原手机号必须与当前绑定号码一致；新手机号不得与当前号码相同，也不得已被其他会员占用，否则返回 `400`。
- 验证码用途分别为 `member_phone_current` 与 `member_phone_new`，有效期 5 分钟，60 秒内不可重复发送。

### 4.15 会员更换手机号

#### POST /api/public/me/phone

- **权限**：会员；**Body**：`{ new_phone, current_code, new_code }`。
- **响应**：更新后的 `member`，`phone` 为新号码。
- 必须同时提供原手机号验证码与新手机号验证码，两段验证码均校验通过后才换号，验证码一次性使用。
- 新手机号已被其他会员占用返回 `400`；验证码错误或过期返回 `400`。
- 换号后原号码不能再作为验证码接收方；操作写入日志（`member / change_phone`，日志中手机号做掩码）。

### 4.16 会员上传照片

#### POST /api/public/me/photo

- **权限**：会员；**multipart**：字段 `file`，支持 PNG、JPG、WebP，单张最大 6 MiB。
- **响应**：更新后的 `member`，`photo_url` 为新照片地址。
- 会员可在会员端直接拍照上传；重复上传会覆盖旧照片并删除旧文件。

### 4.17 会员删除照片

#### DELETE /api/public/me/photo

- **权限**：会员；**请求**：无 Body。
- **响应**：`member`，`photo_url` 为空字符串；原照片文件同时从服务器删除。

### 4.18 登录页运行期开关

#### GET /api/public/app-config

- **权限**：公开；**请求**：无。
- **响应**：`{ demo_login: bool, captcha: bool }`。
- `demo_login` 为真时，员工登录页会预填演示账号 `admin / admin123` 并显示账号提示；正式上线前应在后台关闭该开关，或用环境变量 `LOGIN_DEMO_CREDENTIALS=false` 强制关闭。
- `captcha` 为真时，账号密码登录需要图片验证码。

### 4.19 会员手机端操作指南 PDF

#### GET /api/public/member-guide.pdf

- **权限**：公开；**请求**：无。
- **响应**：`application/pdf` 文件流，`Content-Disposition: inline`，`Cache-Control: no-store`。
- 内容为面向会员的手机端图文操作指南：建桌面快捷方式、会员登录、预约团课、取消已预约团课、查看课程介绍、查看老师资料、查看自己的会员卡与预约课程。
- 前台可在后台「会员通知」页一键下载后转发给会员。

## 5. 经营概览与基础元数据（2）

### 5.1 今日经营概览

#### GET /api/admin/dashboard

- **权限**：只读；**请求**：无。
- **响应**：`today_sessions`、`today_bookings`、`checked_in`、`active_members`、`new_members`、`month_revenue`、`month_cash_received`、`upcoming`、`recent_bookings`。
- `upcoming` 最多 8 节今日排课，`recent_bookings` 最多 8 条今日课程预约；`checked_in` 同时统计 `checked_in` 和 `completed`。
- `month_revenue` 是本月至今日的确认营收，`month_cash_received` 是同期现金实收（含退款负数）；口径与第 9.8 节一致。

### 5.2 后台基础元数据

#### GET /api/admin/meta

- **权限**：只读（`catalog.view`）；**请求**：无。
- `products` 仅在具备 `products.view` 时返回，`users` 仅在具备 `settings.view` 或 `members.write` 时返回，避免下发用不到的数据。
- **响应**：`courses`、`rooms`、`teachers`、`products`、`users` 五个完整数组，包括停用项；另含 `member_sources`（获客来源下拉选项）。
- 用于表单选项和关联展示；接口含全部员工账号，前端不应把响应暴露给非授权用户。

## 6. 会员档案、会员卡、权益与爽约（23）

### 6.1 查询会员列表

#### GET /api/admin/members

- **权限**：只读。
- **Query**：`q`（姓名/英文名/手机号模糊搜索）、`category`（卡类别，可多选，用英文逗号分隔，如 `group,private`）、`card_status`（持卡状态：`active` 有有效卡 / `expired` 卡已过期 / `pending` 开卡日期待定 / `none` 未开卡）、`active_only`（默认 `false`）、`sort`（排序：`card` 默认按会员卡种类自动排序 / `name` 按姓名 / `joined` 按入会时间倒序）、`page`（页码，从 1 开始；**不传则整份返回**，保持旧行为）、`page_size`（每页条数，默认 50，最大 200）。
- **响应**：`{ items: Member[]（含 cards）, total, page, page_size, pages, card_stats }`，`card_stats` 为按卡种统计的人数数组（`product_id`、`name`、`name_en`、`category`、`count`），用于列表底部展示每种会员卡的数量；统计始终基于筛选后的全部会员，不受分页影响。
- 传 `page` 时只序列化当前页的会员（会员上千时页面秒开），`total` 为筛选后的总人数，`pages` 为总页数；页码超出范围会自动回落到最后一页。
- `category` 多选时按业务卡种归类：`group` 团课、`private` 私教与评估、`annual` 年卡与组合套餐；历史 `package` 产品归入 `annual`。
- `sort=card` 的顺序为：年卡 / 组合套餐 → 团课月卡 → 团课十次卡 → 团课六次卡 → 团课周卡 → 私教 10/20/30 次卡；无有效卡的客户排在最后。

#### GET /api/admin/members/options

- **权限**：只读。
- **Query**：`q`（姓名/英文名/手机号模糊搜索）、`active_only`（默认 `false`）、`limit`（最多返回条数，默认 200，最大 20000）。
- **响应**：`{ items: [{ id, name, name_en, phone, active }], total }`；这是下拉选择用的精简名单，不含卡课与档案详情，会员上千时也能秒开。

### 6.2 新建会员

#### POST /api/admin/members

- **权限**：前台。
- **Body 必填**：`name`、`phone`。
- **Body 可选**：`name_en`、`gender`、`id_number`、`birth_date`、`source`、`advisor_id`、`emergency_phone`、`wechat`、`notes`、`active`。
- **响应**：Member（含 cards）。手机号须符合 `1xxxxxxxxxx` 且全库唯一。
- `source` 为获客来源，后台下拉选项来自 `GET /api/admin/meta` 的 `member_sources`；允许沿用历史自定义写法，长度不超过 20 字。

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
- **Body**：`product_id` 必填；`price`（默认产品价，不能为负）、`payment_method`（默认 `cash`）、`starts_on`（默认今日）、`note` 可选、`is_renewal`（默认 `false`）、`start_pending`（默认 `false`）。
- **入账选项**：`record_cash`（默认 `true`）。营收口径统一由系统设置决定（`GET /api/admin/revenue-policy`），请求里的 `revenue_mode` 不再生效。
- **响应**：MemberCard。
- 同一事务创建活动会员卡和正数 `purchase` 流水。有效期为 `starts_on + validity_days`，初始次数与权益复制自产品。入流水与入营收至少选择一项。
- `is_renewal=true` 表示这是**续卡**（重新购卡）：新卡与流水都带续卡标记，便于统计续卡人数与续卡金额；备注会自动以“续卡”开头。
- `start_pending=true` 表示**开卡日期待定**：卡开出来即可正常预约，`starts_on` 与 `expires_on` 暂为空；会员首次签到当天自动开卡，起始日为签到当天、到期日为起始日 + 产品有效期，均摊口径的购卡流水同步改为该起始日。撤销签到会把卡退回“开卡日期待定”状态。
- 私教/评估产品购买不计营收，营收须在实际消课后通过专用接口确认；其余按系统设置的口径执行（`auto` 时年卡/组合套餐及 365 天产品每日均摊，其余购卡时全额确认）。

### 6.6 维护单张会员卡

#### PATCH /api/admin/cards/{card_id}

- **权限**：前台；**响应**：更新后的 MemberCard。
- **Body 通用**：`action`，不同动作使用不同字段。
- 可选 `version`：传当前 `version` 时做乐观锁校验，若该卡已被其他操作修改则返回 `409`，避免并发签到扣次被本次修改覆盖。

| `action` | 附加字段 | 行为 |
| --- | --- | --- |
| `extend` | `days`（非零，绝对值不超过 3650）、`note` | 增加或减少到期日天数 |
| `edit` | `starts_on`、`expires_on`、`note`、`start_pending` | 直接修改开卡日期与到期日（顺延到期日用这个动作），备注可选；`start_pending=true` 把卡改回开卡日期待定，填了 `starts_on` 则当场正式开卡并按产品有效期补出到期日 |
| `freeze` | `frozen_from`（可空，默认今日）、`frozen_until`、`note` | 设置冻结区间，区间内不消耗权益，卡状态置为 `active` |
| `unfreeze` | 无 | 清空冻结开始日与截止日 |
| `activate` | 无 | 状态置为 `active`，不会自动延长已过期日期 |
| `cancel` | 无 | 状态置为 `cancelled`，不生成退款流水 |
| `adjust` | `remaining_sessions`、`benefits`、`note` | 人工校正次数或权益，剩余次数不低于 0 |

每次成功操作增加卡版本。调整权益应传完整 `benefits` 数组；此接口不会反向修改历史预约或财务流水。冻结只在 `frozen_from` ~ `frozen_until` 区间内停用权益，区间之前与之后照常可用；冻结不会自动顺延有效期，需要顺延请用 `edit` 修改 `expires_on`。

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

- **权限**：前台或财务。将正常卡升级为另一产品，原卡状态变为 `upgraded`，新卡继承新产品的有效期和权益，同时生成 `kind=upgrade` 的补差流水。

```json
{
  "product_id": 6,
  "price": 25712,
  "payment_method": "wechat",
  "starts_on": "2026-11-10",
  "note": "月卡补差升级年卡"
}
```

`price` 为本次补差金额，省略时按“新产品标价减原卡实购价、最低为 0”计算。可升级到任意在售产品（不再限制同类别），后台按类别分组展示可选项。响应包含 `old_card`、`card` 和 `difference`。新卡按新产品价格开卡，但不另生成全额购买流水；现金流水只记录本次补差金额。

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

### 6.21 上传会员照片

#### POST /api/admin/members/{member_id}/photo

- **权限**：前台；**multipart**：字段 `file`，支持 PNG、JPG、WebP，单张最大 6 MiB。
- **响应**：更新后的 Member（含 cards），`photo_url` 为新照片地址。
- 会员在会员端上传过的照片可由前台重新替换，旧照片文件会被删除。

### 6.22 删除会员照片

#### DELETE /api/admin/members/{member_id}/photo

- **权限**：前台；**请求**：无 Body。
- **响应**：更新后的 Member，`photo_url` 为空字符串；原照片文件同时从服务器删除。

## 7. 会员合同与评估文件（7）

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

### 7.7 在线查看文件

#### GET /api/admin/documents/{document_id}/view

- **权限**：只读；**响应**：原始文件流，`Content-Disposition: inline`。
- 用于浏览器直接预览 PDF 和图片；Office、CSV 等格式是否可直接显示由浏览器决定。鉴权方式与下载接口相同。

## 8. 排课、预约、教室与目录（30）

### 8.1 查询后台排课

#### GET /api/admin/sessions

- **权限**：只读（`bookings.view`）。
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

- **权限**：只读（`catalog.view`）；**Query**：`date`（默认今日）、`floor`（可选，按楼层精确筛选）。
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

### 8.11 课程库列表

#### GET /api/admin/courses

- **权限**：只读（`catalog.view`）；**Query**：`course_type`（课程类别，可逗号分隔多值）、`q`（按中英文名称模糊搜索）、`active_only`（默认 `false`，只返回启用课程）。
- **响应**：`{ items: Course[], total }`，按课程类别和 ID 排序，不含已删除课程；后台“课程库”页面据此渲染卡片与表格两种视图。

### 8.12 新建课程

#### POST /api/admin/courses

- **权限**：管理员。
- **Body**：Course 字段中的 `course_type`、`name`、`name_en`、`description`、`description_en`、`duration_minutes`、`price`、`color`、`image_url`、`active`；未在代码中额外强制必填，但业务上应提供类型和名称。
- **响应**：Course。

### 8.13 修改课程

#### PATCH /api/admin/courses/{course_id}

- **权限**：管理员；**Body**：与新建相同，部分更新。
- **响应**：Course；不存在返回 `404`。

### 8.14 新建教室

#### POST /api/admin/rooms

- **权限**：管理员；**Body**：`name`、`name_en`、`capacity`、`floor`、`sort_order`、`color`、`active`。
- **响应**：Room。`sort_order` 省略时按当前教室数量生成。

### 8.15 修改教室

#### PATCH /api/admin/rooms/{room_id}

- **权限**：管理员；**Body**：与新建相同，部分更新；**响应**：Room。

### 8.16 新建教练

#### POST /api/admin/teachers

- **权限**：管理员；**Body**：`user_id`、`name`、`name_en`、`phone`、`gender`、`specialties`、`specialties_en`、`bio`、`bio_en`、`image_url`、`visible`、`active`。
- `user_id` 可为空表示不关联；传入时必须是存在、已启用且角色为 `teacher` 的员工账号，且未被其他教练占用，否则返回 `400` / `409`。
- **响应**：Teacher。

### 8.17 修改教练

#### PATCH /api/admin/teachers/{teacher_id}

- **权限**：管理员；**Body**：与新建相同，部分更新；**响应**：Teacher。
- 传入与当前一致的 `user_id` 不会重复校验，便于在不改变关联关系时修改其他资料。

### 8.18 一步完成私教排课与预约

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

### 8.19 空排课移入回收站

#### DELETE /api/admin/sessions/{session_id}/permanent

- **权限**：前台；**Body**：无；**响应**：`{ ok, item, message }`。
- 路径名为历史兼容保留，实际执行软删除而非物理删除。仅从未产生任何预约的排课可通过此入口删除；已有预约（包括已取消预约）返回 `400`，应使用取消课程保留历史。恢复与到期彻底删除见第 16 章。

### 8.20 编辑教室占用

#### PATCH /api/admin/room-reservations/{reservation_id}

- **权限**：前台；**Body**：`room_id`、`title`、`reservation_date`、`start_time`、`end_time`、`usage_type`、`notes` 的任意子集。
- **响应**：`{ ok: true }`。省略字段沿用原值，保存前排除自身并检查课程及其他占用冲突；取消占用仍使用 DELETE 接口。

### 8.21 教室自定义排序

#### POST /api/admin/rooms/reorder

- **权限**：管理员。接收完整 `room_ids` 数组，按数组顺序写入 `sort_order`。

```json
{ "room_ids": [5, 1, 2, 3, 4] }
```

ID 必须覆盖当前全部教室且不能重复。列表和总览按楼层、自定义顺序和 ID 排列；此接口不修改 `floor`。

### 8.22 上传教练照片

#### POST /api/admin/teachers/{teacher_id}/photo

- **权限**：管理员；`multipart/form-data` 上传字段名为 `file`，支持 PNG、JPG、WebP，最大 4 MiB。
- **响应**：更新后的 Teacher。服务端校验真实文件头，`image_url` 为 `/uploads/teachers/...` 路径；上传文件需与数据库一起备份。

### 8.23 查询各教室指定时段占用

#### GET /api/admin/rooms/availability

- **权限**：只读（`catalog.view`）；**Query**：`date`、`start_time`、`end_time` 必填，`exclude_session_id` 可选（编辑排课时排除自身）。
- **响应**：`{ date, start_time, end_time, rooms }`，按楼层和排序返回启用教室；每项在 Room 基础上增加 `available` 和 `conflicts`。
- `conflicts[]` 同时包含重叠课程和内部占用：`kind=class|reservation`、`title`、`title_en`、`teacher_name`、`teacher_name_en`、`start_time`、`end_time`。
- 结束时间必须晚于开始时间。此接口用于在排课编辑器中即时禁用并标注冲突教室；新建和修改排课仍会执行服务端最终冲突校验。

### 8.24 获取课程动态签到码

#### GET /api/admin/sessions/{session_id}/check-in-code

- **权限**：前台（`admin`、`frontdesk`）；API Key 需要 `read`。
- **响应**：`{ token, expires_at, expires_in, refresh_after, session }`；`token` 以 `YYS1.` 开头，前端据此生成供会员扫描的课程二维码。
- 仅在开课前 30 分钟至课程结束提供签到码；未开放或已结束返回 `400`，取消或删除课程不可生成。
- 二维码有效期 60 秒，建议每 30 秒刷新。课程码不能代替会员登录，会员扫描后仍需通过本人 Bearer Token 调用自助签到接口。

### 8.25 前台扫描会员动态码签到

#### POST /api/admin/check-in/scan

- **权限**：前台（`admin`、`frontdesk`）；API Key 需要 `bookings:write`。
- **Body**：`{ token, session_id? }`；`token` 为会员 `YYM1....` 动态码。存在多个可签到预约时，使用 `session_id` 完成指定课程签到。
- **响应**：签到后的 Booking，增加 `already_checked_in`、`check_in_method=member_code`、`member_reminders`。
- 系统只在当天的签到时段内自动匹配。仅一个待签到预约时直接消课；多个待签到预约时先返回以下选择响应且**不扣次**：

```json
{
  "requires_selection": true,
  "member": { "id": 7, "name": "会员姓名" },
  "choices": [{ "id": 101, "session_id": 39, "session": { "id": 39, "start_time": "18:30" } }]
}
```

- 重复扫描已消课预约返回 `already_checked_in=true`，不会重复扣次。无效、篡改或过期签到码返回 `400`；无匹配预约时转预约名单人工核对。

### 8.26 私教/评估消课营收入账

#### POST /api/admin/bookings/{booking_id}/revenue

- **权限**：前台或财务；**Body**：`amount`（大于 0，必填）、`payment_method`（默认 `fitness_member`）、`note` 可选。
- **响应**：`kind=consumption`、`cash_basis=false`、`revenue_mode=immediate` 的 Transaction。
- 仅已签到消课的私教/评估预约可用。金额可参考 Booking 的 `consumption_amount`，也允许按财务口径修改；本接口只入营收，不重复计入现金流水。
- 同一预约当前存在未冲销营收时返回 `409`，不得重复入账。`booking_id + revenue_sequence + kind` 唯一索引防止并发重复；取消签到后自动冲销，再次签到可开启新的营收周期。

### 8.27 上传课程图片

#### POST /api/admin/courses/{course_id}/image

- **权限**：管理员；**multipart**：字段 `file`。
- 支持 PNG、JPG、WebP，最大 6 MiB，校验文件签名；**响应**：更新后的 Course，`image_url` 指向 `/uploads/courses/`。
- 新建课程时先保存课程取得 `course_id`，再调用本接口；也可在课程表单中仅填写已有图片 URL。

### 8.28 移除教练照片

#### DELETE /api/admin/teachers/{teacher_id}/photo

- **权限**：管理员；**Body**：无。
- 清空教练的 `image_url` 并删除服务器上的旧文件；**响应**：更新后的 Teacher。

### 8.29 移除课程图片

#### DELETE /api/admin/courses/{course_id}/image

- **权限**：管理员；**Body**：无。
- 清空课程的 `image_url` 并删除服务器上的旧文件；**响应**：更新后的 Course。

### 8.30 导入 Outlook 会议室日历

#### POST /api/admin/room-reservations/import-ics

- **权限**：需 `bookings.write`。
- **Body**：`ics`（string，必填，ICS 文本内容）、`room_id`（integer，可选；为 0 或缺省时按日程 `LOCATION` 自动匹配教室）。
- **响应**：`{ ok, created, skipped, total }`，`skipped` 为跳过原因数组（如「已经导入过」「与课程冲突」「未指定教室」）。
- 解析 Outlook 导出的 `.ics`：支持 `DTSTART;TZID=Asia/Shanghai`、UTC（`Z`）、全天事件与 `RRULE:FREQ=WEEKLY` 每周重复。
- 每条日程按 `UID` 去重，重复导入不会产生重复占用；导入的占用 `usage_type` 与 `source` 均为 `outlook`，在教室总览里以「Outlook 会议」标注。
- 与已有课程或占用冲突的日程会跳过，不覆盖已有排课。

## 9. 产品、财务与报表（15）

### 9.1 产品列表

#### GET /api/admin/products

- **权限**：只读（`products.view`；教练角色不可见）；**响应**：`{ items: CardProduct[] }`，包含停用产品。

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

- **权限**：财务查看（`finance.view`：`admin`、`finance`、`viewer`）。
- **Query**：`date_from`、`date_to`、`category`、`payment_method`、`member_id`，均可选。
- **响应**：`{ items: Transaction[]（最多1000）, total_amount, revenue_amount, refund_amount }`。
- `total_amount` 仅汇总 `cash_basis=true` 且状态为 `paid`、`refunded` 的记录；仅营收和待核销记录不计入。类别筛选 `private` 包含历史 `assessment`，`annual` 包含历史 `package`。
- `payment_method` 支持多选，用逗号分隔（如 `youzan,dianping`），用于按结账方式查账。
- `total_amount` 为流水总额（已扣退款），`revenue_amount` 为营收总额（已扣退款，按系统设置的口径确认），`refund_amount` 为退款总额；三项都跟随当前筛选条件。

### 9.5 手工入账

#### POST /api/admin/transactions/manual

- **权限**：财务。
- **Body**：`amount`（非零，必填）、`member_id`（可空）、`category`（默认 `misc`）、`payment_method`（默认 `cash`）、`note`。
- **入账选项**：`record_cash`、`revenue_mode=none|immediate|amortized`，至少选择流水或一种营收方式；均摊必须提供有效的 `revenue_start_on` 和 1–3650 天的 `revenue_days`。
- **响应**：`kind=manual`、`status=paid` 的 Transaction。不会自动开卡或修改权益。仅入营收时 `cash_basis=false`，不影响现金实收。

### 9.6 退款

#### POST /api/admin/transactions/{transaction_id}/refund

- **权限**：财务；**Body**：`amount`（默认原单全额）、`note`。
- **响应**：新建的负数 `refund` 流水，继承原单的流水与营收设置。
- 原单必须 `paid` 且金额为正，仅限 `purchase`、`upgrade`、`manual`；退款金额须大于 0 且不超过原单金额。
- 原单改为 `refunded`，不能再次退款，部分退款同样如此。若关联会员卡且全额退款，卡状态改为 `cancelled`；不会返还历史已消耗次数，也不会自动删除预约。

### 9.7 核销购卡电子码

#### POST /api/admin/orders/redeem

- **权限**：前台或财务；**Body**：`redemption_code`，自动去空格并转大写。
- **响应**：`{ ok, card_id, order }`。
- 通过条件更新抢占 `pending` 原单，避免并发重复核销；随后开卡、原单改为 `paid`、关联 `member_card_id` 并记录核销时间和入账人，不重复入账。年卡/套餐均摊从实际开卡日期开始。

### 9.8 综合经营报表

#### GET /api/admin/reports

- **权限**：报表（`reports.view`：`admin`、`finance`、`frontdesk`、`viewer`）；**Query**：`date_from`（默认本月 1 日）、`date_to`（默认今日）。
- **响应**：`range`、`summary`、`amortized_revenue`、`private_recognized_revenue`、`revenue_by_category`、`cash_by_category`、`course_stats`、`teacher_stats`、`weekday`、`hour`、`room_usage`。
- `summary` 含 `revenue`（确认营收）、`cash_received`（现金实收）、`sessions`、`cancelled_sessions`、`attendees`、`booking_count`、`cancelled_bookings`。
- 现金实收只统计查询范围内 `cash_basis=true` 的 `paid` / `refunded` 记录净额；`cash_by_category` 与 `revenue_by_category` 分别展示流水和营收分类。
- `revenue_mode=immediate` 在发生时全额确认；`amortized` 按 `revenue_start_on + revenue_days` 直线分摊，查询未来期间也会计算重叠天数；`none` 不确认营收。
- 私教/评估购买只入流水，实际消课后通过 `consumption` 记录营收；`consumption_reversal` 负向冲销。历史 `legacy` 数据保持原 365 天分摊、私教自动消课和其他即时营收规则，避免重复计算。
- `weekday.label` 为 0–6（周一至周日），`hour.label` 为两位小时；`value` 是实际到课人次。
- 教室统计含 `used_hours`、`internal_hours`、`utilization`；利用率分母按范围内每天 07:00–20:00 的 13 小时计算。

### 9.9 编辑手工入账

#### PATCH /api/admin/transactions/{transaction_id}

- **权限**：财务；**Body**：`member_id`、`category`、`amount`、`payment_method`、`note`、`record_cash`、`revenue_mode`、`revenue_start_on`、`revenue_days` 任意子集。
- **响应**：更新后的 Transaction。只允许 `kind=manual` 且 `status=paid`，金额不能为 0；购买、升卡、退款及已退款手工单返回 `404`。修改后仍会校验流水/营收至少一项及均摊参数。

### 9.10 手工入账移入回收站

#### DELETE /api/admin/transactions/{transaction_id}

- **权限**：财务；**响应**：`{ ok, item, message }`。
- 只允许手工入账。删除后立即从流水、现金实收、确认营收和导出中排除，恢复后重新计入；购买、升卡和退款流水不可删除。

### 9.11 读取购卡营收口径

#### GET /api/admin/revenue-policy

- **权限**：收款与核销（前台 / 财务）；**查询参数**：`product_id` 可选。
- **响应**：`{ system, effective, validity_days }`。
- `system` 是系统设置里设定的口径：`auto`（按卡种自动）/ `immediate`（购卡即全额确认）/ `amortized`（按有效期每日均摊）。
- `effective` 是当前产品实际生效的营收方式：私教与评估始终为 `none`（消课后确认营收），其余按 `system` 与卡种判定。
- 前端购卡弹窗用这个接口展示当前口径，不再逐单勾选；后端以系统设置为准，不接受前端传入的 `revenue_mode` 覆盖。

### 9.12 报表中心可选项

#### GET /api/admin/reports/options

- **权限**：报表（`reports.view`：`admin`、`finance`、`frontdesk`、`viewer`）。
- **响应**：`{ datasets, presets, filters }`。
- `datasets` 列出全部可用数据源（`transactions` 财务流水、`sessions` 课程排课、`bookings` 预约消课、`members` 会员经营），每个数据源带 `dimensions`（可分组维度）与 `metrics`（可统计指标，含 `agg` 汇总方式与 `format` 展示格式）。
- `presets` 为预设报表类型（销售业绩、财务、教学管理、总经理经营、会员经营），带默认数据源、维度与指标组合；前端可在预设基础上自由调整。
- 维度值与指标名均为中文，便于前端直接展示。

### 9.13 按维度生成报表

#### GET /api/admin/reports/table

- **权限**：报表（`reports.view`）；**Query**：`dataset`（默认 `transactions`）、`dimensions`（逗号分隔的维度 key）、`metrics`（逗号分隔的指标 key）、`date_from`、`date_to`，以及可选筛选 `category`、`advisor`、`teacher`、`course_type`、`payment`、`member_id`、`keyword`。
- **响应**：`{ dataset, dataset_name, columns, rows, totals, row_count }`。
- `columns` 中 `kind="dimension"` 的列是分组维度，`kind="metric"` 的列是统计指标；`rows` 每行是一个维度组合，`totals` 是全量合计。
- 指标汇总方式：`sum` 求和、`count` 计数、`avg` 平均（按非零样本）、`rate` 比率（`num`/`den`，返回百分数）。
- 财务流水数据源中，流水类指标（合同金额、现金实收、退款金额、流水金额、笔数）按流水发生日期归属期间，确认营收按确认日期归属期间（每日均摊取摊销起始日），因此与 `/api/admin/reports` 的确认营收、现金实收口径一致。

### 9.14 导出自定义报表 Excel

#### GET /api/admin/reports/table.xlsx

- **权限**：报表（`reports.view`）；**Query**：与 `/api/admin/reports/table` 完全一致。
- **响应**：`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` 文件流，表头为中文，末行为合计。
- 文件名形如 `wellness-report-transactions-2026-11-01-2026-11-22.xlsx`。

### 9.15 导出经营总览 Excel

#### GET /api/admin/reports.xlsx

- **权限**：报表（`reports.view`）；**Query**：`date_from`（默认本月 1 日）、`date_to`（默认今日），开始日期不能晚于结束日期。
- **响应**：多页签 Excel，包含「经营总览」「分类汇总」「课程统计」「教练统计」「教室使用率」五个页签，取代原经营分析 PDF。

## 10. 场馆、品牌与账号（9）

### 10.1 读取系统设置

#### GET /api/admin/settings

- **权限**：管理员；**响应**：AppSettings。
- 字段：`venue_name`、`venue_name_en`、`address`、`address_en`、`phone`、`logo_url`、`favicon_url`、`booking_cutoff_minutes`、`no_show_block_days`、`reminder_hours`、`revenue_mode`、`demo_login_enabled`、`demo_login_locked`、`captcha_enabled`、`mfa_enabled`。
- `revenue_mode` 是购卡营收口径：`auto`（按卡种自动）/ `immediate`（购卡即全额确认营收）/ `amortized`（按有效期每日均摊确认营收）；私教与评估卡始终在实际消课后确认营收。
- `demo_login_enabled` 控制登录页是否预填演示账号；`captcha_enabled` 控制账号密码登录是否需要图片验证码；`mfa_enabled` 控制口令通过后是否还要短信二次验证。
- `demo_login_locked` 为真表示环境变量 `LOGIN_DEMO_CREDENTIALS` 已强制关闭演示账号，此时后台勾选不会生效。

### 10.2 更新系统设置

#### PUT /api/admin/settings

- **权限**：管理员；**Body**：上述字段，但品牌 URL 不接受此接口修改。
- 自助截止 0–10080 分钟，爽约限制 0–365 天，提醒提前量 1–168 小时。
- `revenue_mode` 只能取 `auto` / `immediate` / `amortized`，其他值返回 `400`；修改后立即对新的购卡与升卡生效。
- `demo_login_enabled`、`captcha_enabled`、`mfa_enabled` 接受布尔值；`demo_login_locked` 只读，不可通过接口修改。
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

### 10.9 角色权限矩阵

#### GET /api/admin/role-permissions

- **权限**：管理员（`settings.view`）；API Key 需要 `settings:write`。
- **响应**：`{ roles: [{ role, label, capabilities: string[] }], matrix: [{ capability, label, hint, roles: string[] }] }`，供后台“账号权限”页面展示当前权限矩阵。

### 10.10 品牌静态文件

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
默认模板不含“预约编号”等易被运营商判为敏感词的措辞；若网关报黑词拦截，改写模板措辞后重新保存即可。

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

## 13. 数据导出、备份与恢复（15）

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
- **权限**：按导出类型判定——`members` 需 `members.view`，`bookings` 需 `bookings.view`，`transactions` 需 `finance.view`；API Key 需 `maintenance:write`。
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

### 13.11 导出会员名单 Excel

#### GET /api/admin/export/members.xlsx

- **权限**：需 `members.view`；API Key 需 `read` 范围。
- **Query**：`scope` 取 `all`（全部会员）、`new`（当月新进会员）、`renew_pending`（当月未续会会员），默认 `all`；`month` 为统计月份 `YYYY-MM`，`scope=all` 时忽略；`categories` 为卡种多选（英文逗号分隔，如 `group,private,annual`，为空表示不限）；`only_cards` 默认 `true`，只导出真正买过卡的客户，设为 `false` 才包含未开卡的散客。
- **响应**：`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` 文件流，`Content-Disposition: attachment`。
- 工作表名为“会员列表”，中文表头：会员姓名、照片、手机号码、生日、性别、会员卡类别、合同总金额、购买时间、到期时间、会籍归属、会员时长、备注；首行冻结。
- 会员照片直接嵌入“照片”列单元格（无照片留空），其余列取该会员当前有效会员卡的汇总数据。
- `categories` 与 `GET /api/admin/members` 的卡种口径一致：`group` 团课、`private` 私教与评估、`annual` 年卡与组合套餐。

### 13.12 上传勤鸟导出压缩包导入历史数据

#### POST /api/admin/import/rocketbird/upload

- **权限**：需 `settings.write`，且只接受员工登录会话（API Key 会被拒绝）。
- **multipart**：`file`（ZIP，最大 200MB，仅接受 `.zip`）、`dry_run`（默认 `false`，为 `true` 时只统计不写库）、`include_logs`（默认 `true`，是否导入勤鸟操作日志）。
- 压缩包内需包含勤鸟导出的 CSV，至少包括 `members.csv`、`member_cards.csv`、`sign_logs.csv`、`finance_flow.csv`；系统会自动在解压目录中定位真正存放 CSV 的那一层。
- **响应**：`{ source, directory, dry_run, tables, warnings, notes }`。
  - `tables` 为逐表统计：`{ 数据表名: { read, created, skipped } }`。
  - `warnings` 为需要人工确认的提示，`notes` 为口径说明。
- 解压时逐个校验压缩包内路径，拒绝 `../` 之类的目录穿越；导入结束（含出错）后自动清理解压出来的临时目录。
- 导入按外部 ID 幂等：外部 ID 由来源字段拼成（勤鸟主键或可复现的组合键），重复导入同一批数据时各表 `created` 均为 0，不会产生重复会员、卡、预约与流水，也不会覆盖已有档案。
- 勤鸟的课种、教室、教练、卡产品名称是中英文混在一起的（如「瑜伽拉伸与声音共振 Yogic Stretch & Sound Resonance」）。导入时自动拆开：中文写进 `name`，英文写进 `name_en`，界面与导出不再中英文混排；原文名仍会作为匹配键保留，排期与签到表里的截断名照样能对上。
- 若压缩包里的 CSV 已经带有「课程中文名 / 课程英文名、教室中文名 / 教室英文名、教练中文名 / 教练英文名、卡中文名 / 卡英文名」这些列（由 `backend/scripts/adapt_rocketbird_export.py` 生成），优先采用列里的写法。
- 正式导入会写入一条操作日志（分类 `data_import`）。

### 13.13 从服务器目录导入勤鸟历史数据

#### POST /api/admin/import/rocketbird/path

- **权限**：需 `settings.write`，且只接受员工登录会话（API Key 会被拒绝）。
- **请求体**：`{ path, dry_run?, include_logs? }`。`path` 为服务器上存放勤鸟导出 CSV 的目录，必须包含 `members.csv`、`member_cards.csv`、`sign_logs.csv`、`finance_flow.csv`。
- **响应**：同 13.12 的导入报告。
- 适用于在线服务器上已经放好导出文件、避免经浏览器上传大压缩包的场景。

### 13.14 一键清除全部数据（短信清除码）

清除码只通过短信发送到系统内置手机号 `18602113774`，接口与界面都不会回显清除码本身；
执行清除还需要原样输入确认口令，避免误触。两个接口都只接受员工登录会话，API Key 会被拒绝。

#### POST /api/admin/maintenance/wipe/request-code

- **权限**：需 `settings.write`，且只接受员工登录会话。
- **请求体**：无。
- **响应**：`{ ok, phone, expires_in_minutes, confirm_text, message }`。
  - `phone` 为掩码号码（如 `186****3774`），`confirm_text` 为需要原样输入的确认口令。
  - 响应里**没有**清除码；清除码只出现在发给 `18602113774` 的短信里，10 分钟内有效、只能使用一次。
  - 60 秒内重复请求返回 429。
- 短信通道未启用或未配置服务商账号时返回 502。
- 每次请求会作废上一个未使用的清除码。

#### POST /api/admin/maintenance/wipe/execute

- **权限**：需 `settings.write`，且只接受员工登录会话。
- **请求体**：`{ code, confirm }`。`code` 为短信里的 6 位清除码，`confirm` 需原样填入 `清除全部数据`。
- **响应**：`{ ok, message, deleted_tables, removed_files, kept_username, new_password }`。
- **会删除**：会员、会员卡、会员分享、体验券、课种、教练、教室、排课、预约、预约状态流转记录、
  流水、会员档案记录与附件、通知与提醒、教室预约、操作日志、短信发送与验证码记录、API Key 使用记录，
  以及全部其他员工账号；上传目录（会员照片等附件）里的文件也会一并清空。
- **会保留**：系统设置（场馆名称、Logo、favicon、预约口径、登录安全开关）、短信通道设置、备份计划设置、
  API 密钥，以及当前登录的这一位管理员账号（密码重置为 `Tpc@2026`）。
- 清除后系统不再自动写入演示数据，重启后端也不会再生成示例会员。
- 清除完成后会在操作日志里留下一条 `wipe_data` 记录，作为这次操作的唯一留痕。
- 清除**不可撤销**，执行前请先调用 13.1 的备份接口留一份数据库。

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
POST /api/admin/bookings/{booking_id}/revenue          -> 私教/评估：仅入营收，可选健身会员结账
GET  /api/admin/members/{member_id}                    -> 核对卡、共享卡、预约、体验券和流水
GET  /api/admin/reports                                -> 到课、现金实收与确认营收
```

双向二维码签到可替换上例中的人工 `check_in` 调用，最终状态与扣次逻辑完全一致：

```text
方式 A：GET  /api/public/me/check-in-code                 -> 会员出示 YYM1 动态码
        POST /api/admin/check-in/scan                     -> 前台扫码，自动匹配并消课
        POST /api/admin/check-in/scan + session_id        -> 多候选时确认指定课程

方式 B：GET  /api/admin/sessions/{session_id}/check-in-code -> 前台展示 YYS1 课程码
        POST /api/public/check-in/scan                      -> 会员扫码，本人预约消课
```

误签到使用 `undo_check_in` 返回 `booked`、返还权益并自动冲销已入消课营收，误预约使用 `cancel` 释放席位；不要通过直接调整剩余次数掩盖状态错误。新流程不需要再调用 `complete`，该动作仅为旧数据兼容保留。二维码重复签到是幂等操作，返回 `already_checked_in=true`，无需再调用撤销接口。

### 14.3 电子码购卡闭环

```text
会员：POST /api/public/orders                  -> pending + redemption_code（确认后创建）
会员：DELETE /api/public/orders/{order_id}      -> cancelled（仅未核销且改变主意时）
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

删除接口按调用者当前角色的资源写入能力校验（见第 1.4 节与 `RESOURCE_CAPABILITIES`）；读取回收站、恢复和彻底删除仅允许管理员 JWT 会话。`RecycleItem` 包含 `id`、`resource`、`resource_label`、`title`、`subtitle`、`deleted_at`、`deleted_by`、`days_in_recycle`、`purge_after`、`can_purge`。

### 16.1 查询回收站

#### GET /api/admin/recycle

- **权限**：管理员登录会话；**Query**：`resource`（可选资源标识）、`q`（按名称、说明、删除人或类型搜索）。
- **响应**：`{ items: RecycleItem[], total, retention_days: 180 }`，按删除时间倒序，最多返回 500 条。

### 16.2 移入回收站

#### DELETE /api/admin/recycle/{resource}/{entity_id}

- **权限**：管理员，或具有该资源写入权限的前台/财务角色；不接受 API Key。
- **响应**：`{ ok, item, message }`。已删除或不存在返回 `404`，关联业务或角色限制返回 `400` / `403`。
- 课程、教室、教练、产品、会员、会员卡、共享、提醒、体验券、会员记录、附件、手工入账等按第 1.8 节规则软删除。

### 16.3 恢复数据

#### POST /api/admin/recycle/{resource}/{entity_id}/restore

- **权限**：管理员登录会话；**Body**：无；**响应**：`{ ok, message }`。
- 恢复删除前的 `active`、`status`、`visible` 状态，并重新检查所属会员/教室、共享唯一性、排课及教室时段冲突；冲突返回 `400` 或 `409`，不会强行恢复。

### 16.4 到期彻底删除

#### DELETE /api/admin/recycle/{resource}/{entity_id}/permanent

- **权限**：管理员登录会话；**Body**：无；**响应**：`{ ok, message }`。
- 只有服务器确认删除时间已满 180 天才执行，提前返回 `400` 和可删除时间。外键关联未清理时返回 `409`。
- 合同/评估附件会同时删除磁盘文件；其他业务记录删除后不可恢复，操作写入审计日志。


## 17. 品牌 PDF 导出与账单（3）

以下接口均返回 `application/pdf` 文件流和 `Cache-Control: no-store`；可使用员工 Bearer Token，API Key 还需具备 `read` 范围。各接口的读取能力见下。PDF 使用场馆名称、地址、电话和已上传 Logo；未上传时使用系统默认品牌标识。表格采用 A4 横向、重复表头、交替行底色、筛选条件和页码，适合直接发送或打印。

### 17.1 导出某日教室安排

#### GET /api/admin/rooms/overview.pdf

- **权限**：只读（`catalog.view`）；**Query**：`date`（默认今日）、`floor` 可选。
- 包含所选日期的团课、私教/评估、工作坊、培训及内部/公司/企业活动；列为课程/活动名称、类型、时间、教练、教室、预约人数和备注。
- 预约人数显示“已约/容量”，内部占用不显示人数；按开始时间、教室和名称排序。

### 17.2 导出财务流水 PDF

#### GET /api/admin/transactions.pdf

- **权限**：财务查看（`finance.view`）；**Query**：`date_from`、`date_to`、`category`、`payment_method`、`member_id`，与流水列表一致。
- 包含编号/时间、会员、类别、业务、入账类型、结账方式、金额、状态和备注，并区分流水、流水+营收、营收、每日均摊及营收冲销。
- 抬头合计为「记录数量」「流水总额（已扣退款）」「营收总额（已扣退款）」「退款总额」，并副标题标注当前类别与结账方式筛选。

### 17.3 导出账单小票 PDF

#### GET /api/admin/transactions/{transaction_id}/receipt.pdf

- **权限**：财务查看（`finance.view`）。
- **响应**：单页 **75 × 145 mm** 小票；待核销或已取消记录返回 `400`。
- 包含 Octave/自定义品牌 Logo、健康管理 Wellness、日期时间、项目、金额、入账类型、客户、结账方式、备注、入账人、6% 增值税与去税金额、签字栏及场馆地址电话。
- 去税金额按“含税金额 ÷ 1.06”计算，增值税为含税金额减去去税金额；退款或冲销记录以负数展示。

## 18. 会员群发通知（4）

面向全体会员或指定会员的短信群发通知，可指定发送日期，到点由后台计划任务自动发送；也可立即发送或取消。

### 18.1 通知列表

#### GET /api/admin/notices

- **权限**：需 `members.view`。
- **响应**：`{ items: Notice[] }`，按发送日期与 ID 倒序。
- 每条通知含 `title`、`content`、`send_on`（计划发送日期）、`scope`（`all` 全部会员 / `card_holders` 已购卡客户 / `selected` 指定会员）、`member_ids`（指定会员 ID 数组）、`status`（`scheduled` 待发送 / `sent` 已发送 / `cancelled` 已取消）、`sent_count`、`failed_count`、`created_by`、`created_at`、`sent_at`。

### 18.2 新建通知

#### POST /api/admin/notices

- **权限**：需 `members.write`。
- **Body 必填**：`title`（不超过 100 字）、`content`（不超过 500 字）、`send_on`（`YYYY-MM-DD`）、`scope`（`all` / `card_holders` / `selected`）。
- **Body 可选**：`member_ids`（`scope=selected` 时必填，为会员 ID 数组）。
- **响应**：新建的 Notice，初始 `status=scheduled`。
- `send_on` 为今天或更早的日期时，计划任务会在下一轮轮询（约 20 秒）自动群发。

### 18.3 立即发送通知

#### POST /api/admin/notices/{notice_id}/send

- **权限**：需 `members.write`；**Body**：无。
- **响应**：`{ ok, sent, failed, notice }`。
- 按通知范围选出收件人并逐条发送短信，失败不中断整体流程；发送后 `status=sent`，并记录 `sent_at` 与成功/失败条数。已发送的通知不能重复发送。
- 短信通道未启用或未配置账号时返回 `400`，通知保持 `scheduled` 状态不变，等通道开启后仍可按计划发出。

### 18.4 取消通知

#### POST /api/admin/notices/{notice_id}/cancel

- **权限**：需 `members.write`；**Body**：无。
- **响应**：`{ ok: true, notice }`，`status=cancelled`，不再发送。
