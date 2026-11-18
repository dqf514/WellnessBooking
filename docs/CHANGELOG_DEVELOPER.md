# 音昱 Wellness OS 更新日志（开发者版）

**更新周期：** 2026-11-09 至 2026-11-18
**交付范围：** 会员端、员工及管理后台、后端服务、开放 API、短信与数据运维、帮助文档
**提交规模：** 14 次 Git 提交
**最终版本：** `2d110f8`
**发布状态：** 已全部提交并推送至 `dqf514/WellnessBooking` 的 `main` 分支

本次迭代完整分析了需求 Excel 的 **3 个 Sheet**，参考 reservation 系统的短信平台、数据维护和备份机制，从初始系统搭建持续完善为覆盖 **资源、商品、预约、履约、财务、报表和运维** 的业务系统。

---

## 一、新增功能

### 1. 会员预约与课表

- 支持手机号短信验证码登录，新会员验证后自动建立档案。
- 课程支持团课、私教、评估、工作坊、培训分类筛选。
- 新增**日、周、月三种课表视图**，支持日期切换、回到今天及手机左右滑动翻页。
- 按剩余席位显示不同状态颜色：
  - 绿色：余位充足。
  - 琥珀色：席位紧张。
  - 红色：已经约满。
  - 灰色：课程开始或结束。
- 支持课程详情、预约、取消预约和下载手机日历 `.ics` 文件。
- 预约只占用席位，**签到时才扣除卡权益或体验券**。
- 增加预约截止时间、重复预约、课程容量、会员状态、爽约限制和卡权益校验。
- 未登录会员完成验证后，可继续之前发起的预约或购卡操作。

### 2. 双向动态二维码签到

新增会员与前台双向扫码能力：

- **会员出示个人码，前台扫码签到**：通过后台手机端扫描会员动态码，自动匹配当前可签到预约。
- **前台展示课程码，会员扫码签到**：适用于团课集中到店，会员只能签到本人已预约的课程。
- 支持团课、私教、评估和工作坊，复用统一的签到与消课逻辑。
- 会员码与课程码采用独立签名，不包含手机号等敏感信息。
- 二维码 **60 秒过期、30 秒自动刷新**，接口禁止缓存。
- 可签到时间为**开课前 30 分钟至课程结束**。
- 同一会员存在多个同时段预约时，先由前台选择课程，确认前不会扣次。
- 重复扫码保持幂等，只提示已签到，不会重复消课。
- 支持撤销签到并返还原卡权益或体验券。
- 摄像头不可用时，可粘贴完整签到码，或继续使用预约名单手动签到。

### 3. 购卡申请、确认、取消与核销

- 点击“申请购卡”后，先显示系统风格确认框，不再直接生成订单。
- 未登录用户完成登录后，仍需再次确认申请。
- 确认后生成待核销订单及唯一电子码，并自动进入“我的 → 购卡记录”。
- 待核销订单不会开卡，也不会计入现金实收。
- 会员可取消本人尚未核销的申请，取消前需要二次确认。
- 取消后电子码永久失效，不能恢复或继续核销。
- 已核销、已取消订单不可重复取消。
- 取消与核销采用条件原子更新，防止并发情况下同时成功。
- 后台财务新增明确的“已取消”状态，不再错误归入“已退款”。
- 创建和取消申请均写入操作日志。

### 4. 排课与教室资源管理

- 支持单节排课、编辑排课、调整容量、调课、取消课程和复制上周课表。
- 复制课表时逐节检查重复课程、教练冲突和教室冲突，并返回跳过原因。
- 新增私教一步预约：一次完成排课、会员预约、教练和教室冲突检查。
- 新建或编辑排课时，根据所选时间即时查询教室占用：
  - 冲突教室直接禁用。
  - 显示冲突课程或内部占用的时间、课程和教练信息。
  - 编辑课程时排除课程自身，避免误报。
  - 保存时仍由服务端进行最终冲突校验。
- 课程容量不能低于当前有效预约人数。
- 取消整节课程会处理预约、席位、已扣权益及会员通知，同时保护已经完成的消课历史。
- 教室总览支持：
  - 15 分钟精度排期。
  - 楼层筛选。
  - 卡片和列表视图。
  - 教室自定义排序。
  - 内部活动、公司活动、企业课等占用登记。
  - 占用编辑、取消及冲突检查。
- 教练支持独立管理和照片上传。

### 5. 会员档案与卡课权益

- 建立会员完整档案，整合基本资料、会员卡、预约历史、训练及评估记录、合同附件。
- 支持按姓名、英文名和手机号检索，避免重复建档。
- 卡课产品支持次卡、周期卡、私教卡和组合套餐。
- 套餐按课程类型维护独立权益，不再简单共用一个次数池。
- 支持会员卡：
  - 延期与批量延期。
  - 冻结与恢复。
  - 剩余次数人工校正。
  - 升卡并生成补差流水。
  - 转卡。
  - 家庭共享及移除共享。
- 自有卡和共享卡均可用于预约及消课。
- 新增真实可用的免费体验券，支持发放、停用、消课和撤销返还。
- 新增会员提醒、到期提示及生日前 7 天提醒。
- 合同、评估和会员附件支持上传、下载、编辑分类、删除和恢复。

### 6. 财务入账与经营报表

- 到店售卡实现**开卡与购买流水同时生成**，避免只有卡没有账或只有账没有卡。
- 支持电子码核销开卡、手工入账、流水编辑、退款及 CSV 导出。
- 全额退款可关联销卡，同时保留历史预约与消课记录。
- 购买、升卡和退款流水作为审计凭据保留，不允许随意删除。
- 区分以下财务口径：
  - 现金实收。
  - 购买及升卡入账。
  - 退款支出。
  - 确认营收。
- 确认营收支持：
  - 365 天年卡及相关套餐按天分摊。
  - 私教按实际消课确认。
  - 团课卡按购买确认。
- 经营报表覆盖预约人次、实际上课、取消率、开课率、教练课时、教室使用率、内部占用及重点时段分析。

---

## 二、系统管理与安全

### 短信通知

- 沿用 reservation 系统的欣欣云短信平台及接入方式。
- 支持演示发送和真实发送两种模式。
- 支持预约成功、预约取消和课前提醒场景独立开关。
- 支持短信签名、模板变量、发送接口、余额接口及提醒时间配置。
- 提供余额查询、测试短信、运营商回包和短信发送日志。
- 短信密码仅保存 MD5，不在后台回显。
- 课前提醒增加防重复发送机制。

### 账号与权限

- 支持管理员、前台、财务、教练及只读角色。
- 支持员工新增、编辑、角色调整、密码重置和停用。
- 权限不仅在导航中隐藏，也由服务端再次校验。
- 预约、签到、购卡、核销、退款、备份等关键操作保留审计记录。

### API Key 管理

- 新增 API Key 完整管理页面，不再以无管控方式开放接口。
- 支持创建、编辑、复制、权限范围、有效期、启停、轮换和删除。
- 完整密钥仅在创建或轮换时显示一次，之后只展示掩码。
- 默认建议 90 天有效期，也可按业务需要设置。
- 实际权限同时受创建人角色和 Key 权限范围限制。
- API Key 不能管理其他密钥、修改登录密码或访问会员个人接口。
- 使用日志记录请求路径、状态码、IP、时间和客户端信息。
- 无效、过期及被拒绝的调用同样记录，日志不保存完整密钥或查询字符串。

### 数据维护与回收站

- 支持会员 CSV 模板下载、批量导入及重复手机号跳过或更新策略。
- 支持会员、预约和财务流水 CSV 导出。
- 提供 SQLite 在线一致性备份、备份下载、自动备份计划和保留份数管理。
- 支持从已有备份或上传数据库恢复。
- 恢复前自动备份当前数据库，并校验文件头、完整性和必要业务表。
- 可编辑业务数据、合同及附件补齐完整 CRUD。
- 删除数据统一进入回收站，日常列表、权益、报表、导出和自动短信立即排除。
- 管理员可检索并恢复误删数据；恢复时重新校验关联关系和排课冲突。
- **仅管理员且数据保留满 180 天后才能彻底删除**。
- 合同及附件在回收站期间保留文件，彻底删除时才清理磁盘文件。
- 对存在有效预约、未来排课或到课历史的数据实施删除保护。

---

## 三、界面与交互优化

- 项目品牌统一为“音昱 Wellness”，修正后台品牌文字与背景颜色相近的问题。
- 支持上传和替换站点 Logo、favicon，并可恢复默认品牌图片。
- 前后端开发端口调整为：
  - 前端：`38733`
  - 后端：`38734`
- 管理后台补齐中英文双语，包括页面、状态、表单、提示和财务文案。
- 手机端将客户等高密度表格转换为卡片布局，系统检查会员端和员工端的响应式展示。
- 手机左右滑动用于课表或内容翻页，避免依赖横向滚动条。
- 会员端导航滚动时贴顶，方便长页面中随时切换。
- 预约、取消等反馈改为更明显、位置稳定的通知。
- 退出登录增加确认，并统一为系统风格的确认框。
- 移除数字输入框原生上下箭头。
- 对外首页及课表翻页增加方向性过渡动效。
- 后台导航重新整理为经营概览、教室总览、预约与签到、排课中心、会员管理、资源管理、财务入账、报表分析和系统设置。
- 教室管理、教练管理从系统设置中拆出，归入资源管理独立页面。
- 桌面端父子导航改为**鼠标悬停右侧弹出、移开自动消失**，不再采用展开或折叠模式。
- 手机端继续使用完整汉堡菜单，不受桌面悬停导航影响。
- 帮助入口仅保留在员工登录和后台区域，不在对外网站展示。

---

## 四、问题修复

- 修复后台切换页面时，滚动条出现或消失导致内容区域先偏移、再回正的横向抖动。
- 修复后台直接访问或刷新 `/admin/bookings` 等前端路由时返回 `{"detail":"Not Found"}` 的问题。
- 修复帮助文档内部链接及后台深层链接刷新后的路由匹配问题。
- 修复签到、完成、取消之间可能产生的状态衔接和权益返还问题。
- 修复重复预约、重复签到、重复核销和并发扣次风险。
- 修复已取消购卡订单被错误展示为退款的问题。
- 修复品牌标题对比度、手机端表格和反馈通知位置等体验问题。

---

## 五、文档与开发者支持

- 新增完整的双语系统操作指南：
  - 支持搜索、章节跳转、打印和保存 PDF。
  - 覆盖会员、前台、排课、会员卡、财务、报表、短信、权限、备份、回收站及故障排查。
  - 增加每日、每周和每月运营检查清单。
- 新增并持续同步完整 API 文档：
  - 当前共 **123 个接口**（本批次后为 125 个）。
  - 包含鉴权、角色、API Key、数据结构、错误码、分页、并发规则及典型业务调用顺序。
  - 提供 `docs/API.md` 和可视化 `public/api-docs.html`。
- 二维码签到、购卡取消、回收站和教室冲突查询等最新能力均已同步到帮助与 API 文档。

---

## 六、验证与交付

本次迭代完成了真实业务链路及边界验证，包括：

- 课程、预约、取消、签到、消课、撤销、爽约和权益返还。
- 双向二维码签到、重复扫码、过期码、篡改码、越权访问和时间窗口。
- 多课程候选签到，以及摄像头真实识别流程。
- 购卡申请、确认、取消、核销、重复取消、他人订单访问和并发互斥。
- 卡次数准确扣减，重复操作不会重复扣次。
- 320px、390px 等手机宽度下的二维码、扫码和业务页面适配。
- 前端生产构建、后端 Python 编译检查和 Git 差异检查均通过。
- 测试产生的临时会员、订单、预约、卡、日志及验证码数据已清理。

**最终业务闭环：**

> 课程与资源维护 → 会员购卡与入账 → 课程预约 → 双向扫码签到 → 自动消课 → 撤销与异常处理 → 财务及经营报表 → 短信通知与审计 → 数据备份与恢复

---

## 八、后台导航重构与角色能力矩阵（2026-11-18）

### 1. 能力模型（单一事实来源）

- 新增 `backend/app/permissions.py`：全系统唯一的“角色 → 能力”定义处，含 19 项能力、5 个角色、`RESOURCE_CAPABILITIES`（可回收资源 → 所需能力）与 `permission_matrix()`。
- 新增 `src/lib/permissions.ts`：前端镜像矩阵（`Capability`、`ROLE_CAPABILITIES`、`hasCapability()`、`useCan()`、`RESOURCE_CAPABILITIES`），优先使用服务端下发的 `user.capabilities`，缺失时才回退本地矩阵。
- `serializers.user_dict` 增加 `capabilities` 字段，登录与 `GET /api/auth/me` 均返回，菜单与按钮显隐不再硬编码角色名。

### 2. 后端鉴权改造

- `deps.py` 新增 `require_capability(capability)` 能力门，取代 `require_admin` / `require_read` / `require_staff` 等按角色名写死的依赖；新增 `require_dashboard`、`require_bookings_view/write`、`require_members_view/write`、`require_records_write`、`require_cards_write`、`require_catalog_view/write`、`require_products_view/write`、`require_finance_view`、`require_reports`、`require_recycle_view/write`、`require_settings_view/write`。
- 全部 `routers/*.py` 依赖项重映射到对应能力门；`checkin.py` 的课程码与前台扫码改用 `require_bookings_write`。
- `recycle_service._check_write_role` 改为按 `can_manage_resource(role, resource)` 校验，移除 `FRONTDESK_RESOURCES` / `FINANCE_RESOURCES` / `ADMIN_RESOURCES` 三份角色白名单常量。
- `GET /api/admin/meta` 按能力裁剪：`products` 仅在 `products.view` 时返回，`users` 仅在 `settings.view` 或 `members.write` 时返回。
- `deps.py` 移除 `require_roles` 与 `require_admin` / `require_staff` 别名，接口层只保留能力门，避免再次出现按角色名写死的分支。
- `checkin.py` 的课程码与前台扫码改用 `require_bookings_write`；`recycle_service` 的删除校验改为 `can_manage_resource(role, resource)`。

### 4. 组合权限入口

- 前端新增 `hasAnyCapability()`，导航项与路由守卫支持“满足其中之一即可”，用于“财务入账”这类既能看流水、也能只做电子码核销的组合入口。
- `FinancePage` 拆分渲染：具备 `finance.view` 的角色看到完整流水、汇总与导出；仅有 `revenue.write` 的前台只看到电子码核销，并给出说明，避免前台被挡在核销流程之外。
- `GET /api/admin/maintenance/export/{kind}.csv` 改为按导出类型判定能力（`members.view` / `bookings.view` / `finance.view`），不再一律要求管理员；API Key 仍需 `maintenance:write`。
- `App.tsx` 的路由守卫在概览页本身无权访问时给出提示页，避免反复跳回同一路由形成死循环。

### 3. 新增接口

- `GET /api/admin/courses`：课程库列表，支持 `course_type`、`q`、`active_only` 筛选，供独立页面渲染卡片/表格两种视图。
- `GET /api/admin/role-permissions`：返回角色能力清单与权限矩阵；`required_api_key_scope` 对该路径强制要求 `settings:write`，只读 scope 不返回。

### 4. 前端导航与页面

- `AdminLayout` 导航改为声明式 `navSections()`，按能力过滤菜单项与分组；分组无可见子项时整体隐藏。
- `App.tsx` 的 `Protected` 组件新增能力守卫，路由与菜单使用同一份能力判定，无权访问时回落到经营概览。
- 新增 `src/pages/admin/CoursesPage.tsx`：课程库独立页面，支持筛选、搜索、增删改查、图片上传与移除、卡片/表格视图切换、移入回收站。
- 删除 `src/components/CourseLibraryModal.tsx`，排课页改为跳转新页面。
- `RecycleDeleteButton` 按 `RESOURCE_CAPABILITIES` 自动隐藏无权删除的按钮；`MemberProfileDrawer` 改为接收 `can(capability)` 回调，按能力逐项控制购卡、赠券、共享、转卡、跟进记录等操作。
- `ProductsPage` / `FinancePage` / `BookingsPage` / `RoomsPage` / `MembersPage` 的写操作按钮统一改为 `useCan(...)` 判定。

### 5. 文档

- `docs/API.md` 新增 1.4 节角色能力矩阵、第 8 章课程库列表、第 10 章角色权限矩阵接口，接口总数更新为 **125 个**（与 `/openapi.json` 逐条比对一致）。
- `public/api-docs.html` 由 `python docs/build_api_docs.py` 重新生成（17 章节 / 125 接口）。

**验证：** `npm run build`（`tsc -b` + `vite build`）通过；`python -m compileall -q backend/app` 通过；五个角色冒烟测试覆盖课程库、权限矩阵、流水、报表、产品、会员与回收站接口的读写，权限外请求均返回 `403` 且未落库。

---

## 七、教练账号关联与业务逻辑加固（2026-11-18）

### 1. 教练与员工账号关联

- `teachers.user_id` 用于把教练绑定到角色为 `teacher` 的员工账号；未关联时为 `null`，一名教练最多关联一个账号，一个账号最多被一名教练占用。
- `POST/PATCH /api/admin/teachers` 增加关联校验：账号必须存在、未删除、角色为 `teacher`，且未被其他教练占用，否则返回 `400` / `409`；传入与当前一致的 `user_id` 时跳过重复校验。
- `database.ensure_constraints()` 启动时清理历史重复关联后建立部分唯一索引 `ux_teachers_user_id`；建索引失败只记录日志，不阻断服务启动。
- 回收站链路对称化：教练移入回收站时停用关联账号，恢复或彻底删除后还原账号启用状态，并写入 `restore_linked_account` 审计。

### 2. 照片与图片管理

- 新增 `DELETE /api/admin/teachers/{teacher_id}/photo` 与 `DELETE /api/admin/courses/{course_id}/image`：清空 `image_url` 并删除服务器上的旧文件。
- 前端教练与课程表单移除冗余的图片 URL 输入框，只保留上传控件。

### 3. 员工自助资料与密码

- 新增 `PATCH /api/auth/me` 与 `POST /api/auth/me/password`：任意角色的登录员工均可修改自己的姓名、绑定手机号与密码。
- 手机号唯一性与格式校验；改密需校验原密码，新旧密码相同直接拒绝；API Key 不具备修改登录密码的能力。
- 前端新增 `PersonalProfilePanel`，挂在后台侧边栏左下角头像上，取代原先仅管理员可见的账号编辑入口。

### 4. 座位计数缺陷修复（超卖风险）

- `booking_service._release_session_slot()` 原先在条件 UPDATE 之后又对 ORM 实例做了一次自减，导致后台取消预约时名额被扣两次。
- 修复后只保留原子 UPDATE，并通过 `db.refresh()` 同步实例状态；10 个名额的课程不会再被约到 12 人。

### 5. 输入校验与错误码治理

- `utils.py` 新增 `as_int` / `as_float` / `as_bool` / `valid_benefits`，非法数值统一返回 `400` 而不是 `500`。
- 应用范围：会员与会员卡、产品与手工入账、升额、提醒与体验券、排课与课程 / 教室 / 教练、系统设置、公开端购卡申请。
- 外键校验：`Member.advisor_id`、`MemberRecord.teacher_id` 写入前校验目标存在，非法编号返回 `400`。
- 排课接口统一归一化日期、时间、容量、状态与外键，并拒绝结束时间早于开始时间。
- `card_service` 与 `public` 生成卡号 / 电子码时增加去重重试，随机撞码不再直接 500。

### 6. 并发与一致性

- `PATCH /api/admin/cards/{id}` 改为基于 `member_cards.version` 的乐观锁更新，版本不符返回 `409`，避免与并发签到扣次互相覆盖。
- `card_dict` 暴露 `version`，前端 `MemberProfileDrawer` 在卡权益操作时携带版本号；遇到 `409` 自动关闭编辑框并刷新数据。
- 版本比较统一对历史 `NULL` 版本号做兼容（`version IS NULL` 视同 `0`），避免老数据上的并发校验永远失败。
- 会员卡剩余次数调整后按 `total_sessions` 截断；套餐分项权益在写入前做结构校验。
- CSV 会员导入在 `autoflush=False` 下无法感知同文件内新建会员，改为维护本次导入的手机号索引，避免唯一约束冲突导致整批回滚。

### 7. 权限模型调整

- 新增 `require_revenue = require_roles("admin", "finance", "frontdesk")`，用于购卡、升额、电子码核销与私教消课营收入账。
- 保留 `require_finance` 给纯财务操作，避免前台与财务互相锁死。
- `deps.required_api_key_scope()` 修正 `PATCH /api/admin/records/{id}` 无规则可匹配的问题（此前任何凭证都是 403），并把收入账与升额划入 `finance:write`。

### 8. 前端体验

- 后台侧边栏头像与角色标签按新角色体系补全；只读账号在排课与教室页面禁用编辑按钮并给出说明。
- 员工停用增加二次确认弹窗；回收站显示总条数。
- `adminMessages.ts` 补充约 90 条后端提示的中英映射，并新增“必须是数字 / 有限数字 / 布尔值 / 不能为空”四种通用句式翻译。
- `apiFetch` 在英文界面下自动翻译后端 `detail`，错误对象附带 HTTP 状态码，便于前端区分冲突（`409`）等情形。

### 9. 文档

- `docs/API.md` 同步教练账号关联规则、`PATCH /api/auth/me`、两张图片删除接口、权限措辞与 API Key 范围说明，共 **123 个接口**（本批次后为 125 个）。
- `public/api-docs.html` 由 `python docs/build_api_docs.py` 重新生成。

**验证：** `npx tsc -b` 无错误；`npm run build` 通过；`python -m compileall -q backend/app` 通过。

**最新提交：** `2d110f883117886079c4cc64af9269661d218d8f`
**GitHub：** `https://github.com/dqf514/WellnessBooking`

---

## 九、更新说明页面与侧边栏底部快捷操作（2026-11-18）

### 1. 图文更新说明页面

- 新增 `public/changelog-2026-11-18.html`：独立静态页面（无构建依赖，直接由 `SPAStaticFiles` 伺服），按“需求 → 实现 → 画面”逐条对照 2026-11-17 的 14 条需求与 2026-11-18 的 6 组改动，并附 26 张界面截图与图注。
- 截图资源置于 `public/changelog-2026-11-18/`，统一压缩到宽 1500px 以内，四张大图转 JPEG 控制体积（合计约 5MB）。
- 页面复用 `public/help.html` 的 pine/sage 设计变量，含目录锚点、打印样式（可直接“打印 / 保存 PDF”）、响应式布局与移动端适配。
- 权限矩阵表直接取自 `backend/app/permissions.py` 的 `CAPABILITY_GROUPS` 与 `ROLE_CAPABILITIES`（19 项能力 × 5 种角色）。

### 2. 侧边栏底部快捷操作

- `AdminLayout.tsx`：侧边栏底部原“English / 操作指南 / 会员预约端”三项，收起为 `.sidebar-quick` 横向排列的三个图标按钮（语言用新增的 `globe` 图标，操作指南用 `book`，会员预约端用 `home`），保留 `aria-label` 与 `title` 说明。
- `UI.tsx`：`IconName` 新增 `globe`，并补充对应路径。
- `styles.css`：新增 `.sidebar-quick` / `.sidebar-quick-btn` 样式（深色底 40×40 方钮、悬停高亮、移动端 44×44）。

**验证：** `npm run build`（`tsc -b` + `vite build`）通过；桌面端与 432px 手机端均已截图核对。

---

## 十、系统设置“更新日志”页（2026-11-18）

### 1. 数据与组件

- 新增 `src/lib/changelog.ts`：版本常量（`APP_VERSION` / `APP_RELEASE_DATE` / `API_VERSION` / `API_ENDPOINT_COUNT`）与结构化更新日志（`changelogReleases`，按日期为分界，每条含版本号、概述与分组要点，中英双语）。
- 新增 `src/pages/admin/settings/ChangelogSettings.tsx`：版本卡片 + 按日期分界的时间线，右上角链接到完整图文说明页 `/changelog-2026-11-18.html`。
- `SettingsPage.tsx` 新增 `changelog` 标签页（“更新日志”），位于“操作日志”之后。
- `src/styles.css` 新增 `.changelog-version` / `.changelog-timeline` / `.changelog-release` / `.changelog-group` 样式，窄屏下时间线转为单列。
- `src/lib/adminTranslations.ts` 补入“更新日志 / 当前版本 / 接口版本 / 更新批次 / 查看完整图文更新说明”等后台文案的中英映射。
- `package.json` 版本号由 1.0.0 提升为 1.1.0；API 契约版本仍为 v1.0.0（无破坏性变更，接口总数仍为 125）。

**验证：** `npm run build`（`tsc -b` + `vite build`）通过；后台“系统设置 → 更新日志”已截图核对中英文渲染。

---

## 十一、会员自助资料与获客来源下拉（2026-11-18）

### 1. 会员端自助维护个人资料

- `backend/app/routers/public.py` 新增三个会员端接口：
  - `PATCH /api/public/me/profile` —— 会员自助修改姓名与生日（姓名非空、≤ 40 字；生日须为 `YYYY-MM-DD`、不晚于今天、不超出 120 年；空生日视为清空）。
  - `POST /api/public/me/phone/code` —— 发送换号验证码，`purpose` 取 `current` / `new`，分别复用 `send_otp` 的 `member_phone_current`、`member_phone_new` 两个用途，验证码 5 分钟有效、60 秒防重发。
  - `POST /api/public/me/phone` —— 原号与新号两段验证码均通过后才改号，改号前校验新号未被其他会员占用，写入 `member / change_phone` 操作日志（日志中手机号掩码）。
- 短信验证码表沿用既有 `SmsOtpCode`，未新增表；`ensure_schema()` 无需改动（未新增数据库列）。
- 新增 `src/components/MemberProfilePanel.tsx`：会员端“个人信息”面板，含会员编号、入会时间、绑定手机号（掩码）、姓名与生日表单、双验证码换号流程，演示模式下显示 `dev_code`。
- `src/pages/PublicHome.tsx`：“我的”弹窗新增 `profile` 标签页并设为默认页签，渲染 `MemberProfilePanel`，保存后调用既有的 `loadMe` 刷新。
- `src/styles.css` 新增 `.member-profile-panel` / `.profile-block` / `.profile-summary` / `.profile-notice` 样式，窄屏下摘要转单列。

### 2. 获客来源改为下拉选择

- `backend/app/membership_service.py` 新增 `MEMBER_SOURCE_OPTIONS`（16 个行业常用渠道）、`normalize_member_source()`（空白规整与 20 字上限）与 `split_member_source()`（拆出“其他 · 说明”）。
- `backend/app/routers/admin_core.py`：`GET /api/admin/meta` 增加 `member_sources`；`create_member` / `update_member` 对 `source` 做归一化校验，保留历史自定义写法（不做枚举拒绝，避免开放 API 写入被拦截）。
- `src/pages/admin/MembersPage.tsx`：“获客来源”输入框改为 `<select>`，选项取自 `meta.member_sources`；选择“其他”时展开“来源说明”输入框，保存时拼成 `其他 · 说明`；档案中的历史自定义值以“历史记录”选项形式保留，不会被静默改写。
- `src/types.ts`：`Meta` 增加 `member_sources` 字段。

### 3. 文档

- `docs/API.md`：会员端章节由 12 个接口增至 15 个（新增 4.13 ~ 4.15），`GET /api/admin/meta` 补充 `member_sources` 说明，`POST /api/admin/members` 补充来源字段规则。
- `python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（接口总数 125 → 128）。
- `src/lib/changelog.ts`：`API_ENDPOINT_COUNT` 同步为 128，并在 2026-11-18 批次新增“会员自助资料与获客来源”分组。

**验证：** `npm run build`（`tsc -b` + `vite build`）通过；`curl` 覆盖 11 项接口行为（含未来生日、空姓名、验证码用途错误、换号后旧号失效、新号被占用等异常分支）；会员端桌面/移动端与后台会员编辑弹窗均已截图核对。

---

## 十二、教室总览横向导航与列宽优化（2026-11-18）

### 1. 顶部滚动按键与教室色块

- `src/pages/admin/RoomsPage.tsx` 新增 `scrollRef`（表格横向滚动容器）、`stripRef`（色块条容器）与 `scroll` 状态（`scrollLeft` / `scrollWidth` / `clientWidth`）。
- 滚动监听：容器 `scroll` 与 `window` `resize` 时同步状态，并把色块条 `scrollLeft` 按比例对齐到表格位置（色块条相当于缩略滚动条）。
- `columnWidth` 由 `scrollWidth / 可见教室数` 推导，`firstVisible` / `lastVisible` 由滚动位置换算，用于高亮当前可见教室。
- `scrollRooms(direction)` 以 0.8 屏宽为步长平滑平移；`jumpToRoom(index)` 精确定位到某间教室并把对应色块带入可视区。
- 左右按键的 `has-course` 样式由该方向是否存在有排课的教室决定（`rooms.slice(...)`），到两端时按键 `disabled`。
- 顶部操作带仅在宽屏渲染（`compact` 为移动端分页模式），CSS 侧 `@media (max-width: 700px)` 隐藏 `.room-scroll-strip`。

### 2. 结构与样式调整

- 新增 `.room-scroll-strip` / `.room-scroll-arrow` / `.room-scroll-track` / `.room-chip`（`course` / `reserved` / `free` 三种配色）与 `.room-scroll-hint` 样式。
- 教室列最小宽度由 150px 压缩为 104px（`.room-columns { min-width: calc(var(--room-count) * 104px) }`），同样宽度下可见教室由约 10 间增加到约 13 间。
- 时间轴从滚动容器中独立出来：`.room-timeline` 改为 `.room-timeline-frame`（`grid-template-columns: 54px minmax(0, 1fr)`），左列为时间轴、右列为 `.room-timeline-scroll` 滚动容器，`.room-columns` 变成滚动容器内的网格；横向滚动时时间刻度保持可见。
- 移动端媒体查询同步调整：`.room-timeline-frame` 在窄屏恢复 `display: block` 并去掉边框，时间轴继续隐藏，教室卡片竖排。

### 3. 验证

- `npm run build`（`tsc -b` + `vite build`）通过，无新增类型错误。
- 以 16 间教室的临时数据做了截图核对：初始位置左键置灰、点击右键后表格平移且时间轴不动、点击色块可定位到指定教室；移动端分页卡片布局与顶部操作带隐藏均正常。
- 验证用临时教室与当日课程已在核对完成后从 `backend/data/wellness.db` 删除，数据库恢复为 5 间教室的原状。

---

## 十三、会员档案头部重排（2026-11-18）

### 1. 问题定位

上一批新增的会员端 `MemberProfilePanel` 复用了通用类名 `.profile-summary`，其样式写在 `src/styles.css` 靠后位置（`.member-profile-panel .profile-summary` 之前是裸 `.profile-summary`），特异性与出现顺序都压过后台抽屉的同名规则，导致：

- `.profile-summary span { background: var(--paper) }` 把后台抽屉的头像 `.profile-avatar` 也染成浅灰，出现“文字与背景没反差、看不清”的问题。
- `.profile-summary { grid-template-columns: repeat(3, minmax(0, 1fr)) }` 把后台抽屉的资料区压成三列堆在中间，纵向占位变高。

### 2. 实现

- `src/styles.css`：会员端规则收窄作用域为 `.member-profile-panel .profile-summary`（含 `span` / `small` / `strong` 与 640px 媒体查询），后台抽屉的 `.profile-summary` / `.profile-avatar` 样式恢复正常。
- `src/components/MemberProfileDrawer.tsx`：头部结构由“头像 + h2 + `.profile-contact-grid` + `.profile-meta` + 备注”改为三段式：
  - `.profile-head`：头像 + 中文名（大字）与英文名（小字）同一行；
  - `.profile-facts`：手机号 / 性别 / 出生日期 / 获客来源 / 会籍归属 / 微信号 / 紧急联系合并为一行，`repeat(auto-fit, minmax(130px, 1fr))` 自适应铺满宽度；
  - `.profile-note`：备注单独一行，图标由 `bell` 改为 `book`，颜色沿用 `--amber-soft`。
- 样式新增 `.profile-head` / `.profile-facts` 系列规则，`.profile-avatar` 由 84×100 圆角块改为 54×54 方块；删除已无引用的 `.profile-contact-grid`、`.profile-meta` 及其在各档媒体查询中的覆盖规则。
- 移动端（≤700px）头部压缩为 46px 头像与 20px 姓名，`.profile-facts` 最小列宽降到 112px；≤480px 时 `.profile-facts` 固定两列。

### 3. 验证

- `npm run build`（`tsc -b` + `vite build`）通过。
- 截图核对：后台抽屉宽屏（1600px）与窄屏（390px）下姓名行、信息行、备注行均按预期排布；会员端“个人信息”面板（`.member-profile-panel`）显示未被影响。

---

## 十四、教室总览全屏大屏视图与自适应排课块（2026-11-18）

### 1. 全屏排课表

- 新增 `src/components/RoomScheduleBoard.tsx`：通过 `createPortal` 挂到 `document.body`，全屏铺满视口（`.room-board`），标题栏保留标题、居中的日期与时钟、操作提示与关闭按钮。
- 布局按可用空间自适应：`.room-board-body` 为 `grid-template-columns: 52px minmax(0, 1fr)`，列宽 `roomWidth = floor((bodyWidth - 52) / 教室数)`，行高 `hourHeight = floor((bodyHeight - 30) / 小时数)`，分别写入 CSS 变量 `--board-room-width` 与内联高度，保证所有教室与 07:00–22:00 全部落在视口内，无需横向或纵向滚动。
- 键盘：`document` 上的 `keydown` 监听 `ArrowLeft` / `ArrowRight` 切换日期（复用 `addDays`）、`Escape` 关闭；打开时给 `body` 加 `room-board-open` 类以锁定页面滚动，卸载时移除。
- 打印：`@media print` 中隐藏 `#root`、把 `.room-board` 改为静态定位、列宽改为 `minmax(0, 1fr)` 均分，并声明 `@page { size: A3 landscape; margin: 8mm }`，实测 `Page.printToPDF` 输出单页 A3 横向（1191×842pt）。
- 入口：`RoomsPage` 新增 `.room-board-action` 按钮（`Icon name="expand"`，图标在 `src/components/UI.tsx` 补充），现位于右上角 `PageHeader` 的按钮区（详见第十六节），`≤700px` 时隐藏（移动端为分页卡片视图，不提供大屏）。
- `RoomsPage` 新增 `shiftDate(delta)`，全屏下的前后翻日不与移动端的“翻页”逻辑冲突。

### 2. 浏览器全屏（等同 F11）

- 新增导出函数 `requestBoardFullscreen()`：调用 `document.documentElement.requestFullscreen()`，失败时静默降级（`.catch(() => {})`）为整页浮层，不影响大屏本身。
- 组件内监听 `fullscreenchange`：进入全屏后浏览器地址栏与工具栏自动隐藏；退出全屏时同步关闭大屏；组件卸载时若仍处于全屏则调用 `exitFullscreen()` 还原。
- 样式补充 `html:fullscreen, html:fullscreen body { overflow: hidden; background: #fff; }`，避免全屏时出现滚动条与白边。
- 说明：自动化浏览器 profile 未授予 Fullscreen 权限（`Runtime.evaluate` 报 “Permissions check failed”，真实 CDP 鼠标点击同样被拒），因此该路径只能在真实浏览器中验证，代码保留降级兜底。

### 3. 居中日期与实时时钟

- 标题栏改为 `grid-template-columns: 1fr auto 1fr` 三列：左侧标题、中间日期 + 时钟、右侧提示与关闭按钮；`.room-board-title` 用 `justify-self: start`，`.room-board-tools` 用 `justify-self: end`。
- 新增 `useClock()`：`setInterval` 每秒更新 `new Date()`，卸载时清理定时器；显示格式 `HH:MM:SS`，`.room-board-clock` 字号 32px、日期 22px。
- 星期由 `new Date(`${date}T00:00:00`).getDay()` 映射到 `WEEKDAYS`。

### 4. 排课块高度覆盖时间段 + 文字随格子自适应

- `RoomsPage.blockStyle()` 与 `RoomScheduleBoard.sizeOf()` 均改为按 `结束时间 - 开始时间` 计算高度（`Math.max(26/24, 时长 / 60 * 行高)`），`top` 仍按开始时间定位。
- 样式侧使用 **CSS 容器查询**：`container-type: size` 让排课块成为独立容器，字号用 `cqh` / `cqw` 单位取小值自适应（`max(10px, min(30cqh, 12cqw))` 与 `max(12px, min(42cqh, 20cqw))`），并以 flex 垂直居中、单行省略号收尾。
- 需注意 CSS 层叠：文件后段的 `.room-block > span { font-size: 12px }` 等同优先级规则会覆盖新规则，已删除/改写；`noUnusedLocals` 下 `tsc -b` 是唯一质量闸门。

### 5. 左侧时间刻度对齐修复

- 原 `.time-axis > span` 用绝对定位相对 `.time-axis` 定位，而 `.time-axis` 含 78px 表头，导致刻度整体上移约一小时（实测标签 450.39px vs 网格线 516.39px）。
- 改为新增 `.time-axis-track` 容器（`height: 900px`）承载刻度，`.time-axis-track > span` 相对该容器定位并 `translateY(-6px)`，与网格线、课程块严格对齐；`≤700px` 媒体查询同步调整字号与右偏移。

### 6. 验证

- `npm run build`（`tsc -b` + `vite build`）通过。
- CDP 脚本核对：全屏打开后 `ArrowRight` 日期由 2026-11-18 变为 2026-11-19、`ArrowLeft` 还原、`Escape` 关闭且 `body` 类名复位；时钟从 `14:44:45` 走到 `14:47`，再次采样从 `14:48:45` 走到 `14:48:47`。
- 字体测量：普通排课块 60px×93px 对应 `span` 11.7px / `strong` 16.38px；大屏排课块 55px×83px 对应 `span` 10px / `strong` 14px。
- 截图核对：1600px 下 17 间教室全部可见且无滚动条；打印媒体模拟与 `printToPDF` 均只输出排课表本身（无后台侧边栏与工具栏）。
- 验证用临时教室、当日课程与占用记录已在核对完成后从 `backend/data/wellness.db` 删除，数据库恢复原状。

---


## 十五、经营概览今日安排与教室大屏直达（2026-11-18）

### 1. 后端数据复用

- 无需新增接口：概览面板直接复用 `GET /api/admin/rooms/overview?date=YYYY-MM-DD`（已具备 `require_catalog_view` 能力门），返回的 `rooms[]` 含 `sessions[]` 与 `reservations[]`。
- `DashboardPage` 新增 `OverviewRoom` / `RoomReservation` / `TimelineItem` 三个本地类型，`USAGE_TYPES` 映射 `internal` / `company` / `enterprise` 三种教室占用类型到中文名、标签色调与色值。

### 2. 今日安排面板

- 面板标题由“今日课程”改为“今日安排”，`timeline` 用 `useMemo` 把 `data.upcoming` 的课程与 `overview[].reservations` 的教室占用合并，按 `start_time` 再按 `end_time` 排序。
- 课程条目渲染为 `<Link to="/admin/bookings">`，教室占用渲染为只读 `<div class="timeline-row reservation">`（`cursor: default`），避免误触。
- 徽标：课程显示 `已约/容量`（余位为 0 时红色），教室占用显示类型标签（琥珀/蓝色）。
- 文案补入 `src/lib/adminTranslations.ts`（“今日安排”“打开教室大屏”），英文回退查 `adminTranslations` → `adminMessages`。

### 3. “完整课表”直达教室大屏

- 面板右上角新增 `.panel-action` 按钮（原为无按钮的静态标题），点击时 `setBoardOpen(true)` 并调用 `requestBoardFullscreen()`。
- 大屏数据按 `boardDate` 独立拉取：`useEffect` 依赖 `[boardOpen, boardDate]`，左右方向键切日时自动按新日期重新请求 `/api/admin/rooms/overview`。
- `RoomScheduleBoard` 组件本身可复用，教室总览页与经营概览页共用同一实现。

### 4. 验证

- `npm run build` 通过。
- CDP 核对：经营概览渲染 12 行，其中 4 行为教室占用，徽标分别为“内部使用 / 公司活动 / 企业活动”；点击“完整课表”后大屏打开，含 17 间教室、68 个排课块。
- 截图：`public/changelog-2026-11-18/32-room-board.jpg`、`33-rooms-blocks.jpg`、`34-dashboard-schedule.jpg`。

---

## 十六、教室总览布局收紧（2026-11-18）

### 1. 日期选择并入筛选区

- `RoomsPage` 中原本的 `<Field label="查看日期">` 换成自定义的 `.room-date-field`（`div.field` + `span` 标签 + `.room-date-picker`），下拉框左右各放一个 `.icon-button`，分别调用 `shiftDate(-1)` / `shiftDate(1)`。
- 不用 `Field` 组件的原因：`Field` 渲染的是 `<label>`，内嵌两个 `<button>` 会造成 label 与多个可标记控件关联的无效嵌套。
- 移动端（`≤700px`）下 `.filter-panel .room-date-field` 占满整行，两个箭头放大到 40×42px 便于点按。
- `shiftDate()` 原本只被全屏大屏的翻日使用，现在同时服务筛选区箭头；移动端底部“教室 N / M 页”的翻页仍走 `previous()` / `next()`（内部含翻页与翻日的兼容逻辑），行为不变。

### 2. 全屏按钮移到右上角按钮区

- `.room-board-trigger` 从 `.room-date-navigation` 中删除，改为 `.room-board-action`，放进 `PageHeader` 的 `actions`，位置在“导出安排 PDF”与“预约教室”之间，文案为“全屏排课表”，样式沿用 `button-outline`。
- 移动端隐藏：原先的 `@media (max-width: 700px) { .room-board-trigger { display: none } }` 同步改为 `.room-board-action`。

### 3. 移除中间行

- `.room-date-navigation` 现在只在 `compact`（移动端卡片视图）下渲染，且只保留教室翻页信息与箭头；桌面端整行不再输出，`date` 由筛选区的日期下拉承载。

### 4. 行高压缩（60px → 44px）

- `RoomsPage` 新增模块级常量 `HOUR_HEIGHT = 44`：`blockStyle()` 的 top/height、`.room-slot-button` 的 top、时间刻度的 top 全部改用它。
- 样式侧不再写死像素：`.room-slots` 与 `.time-axis-track` 高度改为 `calc(var(--room-hour, 60px) * 16)`，`.time-axis` 高度改为 `calc(78px + var(--room-hour, 60px) * 16)`，`.room-slot-button` 高度改为 `var(--room-hour, 60px)`；变量由 `.room-timeline-frame` 的内联样式 `--room-hour` 提供。
- 用 CSS 变量而不是内联 height 的原因：`≤700px` 媒体查询里 `.room-slots { height: auto }`、`.time-axis { display: none }` 需要继续生效，内联 height 优先级更高会破坏移动端卡片视图。
- 排课块字号随之微调：`strong` 的容器查询上限由 `min(42cqh, 21cqw)` 改为 `min(38cqh, 19cqw)`（44px 行高下约 16.7px），让课程名多显示一两个字。

### 5. 验证

- `npm run build`（`tsc -b` + `vite build`）通过。
- CDP 核对：`.room-date-picker` 两个箭头的 aria-label 正确，点击后日期 2026-11-18 → 2026-11-17 → 2026-11-18；页面按钮顺序为「导出安排 PDF / 全屏排课表 / 预约教室」；`.room-date-navigation` 在桌面端不存在；`.room-slots` 高 704px、`.time-axis` 高 782px、`.room-slot-button` 高 44px。
- 移动端（390px）核对：全屏按钮隐藏，底部仍显示“教室 1 / 9 页”翻页条，日期下拉左右箭头可点。
- 桌面端点击右上角“全屏排课表”可正常打开大屏，时钟逐秒走动。

---

---

## 十七、对外页面的员工入口直达后台（2026-11-18）

- 会员端页脚的“员工后台”链接由 `/login` 改为 `/admin`：`/admin` 路由由 `Protected` 守卫，未登录时自动 `<Navigate to="/login" replace/>`，已登录时直接进入后台首页，已登录的同事不必再经过登录页。
- `public/help.html` 顶部的“进入员工后台”、内页的“打开员工后台”，以及 `public/changelog-2026-11-18.html` 顶部的“进入员工后台”同步改为 `/admin`。
- `LoginPage` 路由与退出登录后的跳转保持 `/login` 不变；`/admin` 与 `/login` 由后端 `SPAStaticFiles` 回落 `index.html`，直接访问均可正常打开。
- 验证：CDP 实测未登录点击页脚入口后跳到 `/login` 并渲染登录表单；写入员工令牌后点击同一入口停在 `/admin`，渲染后台框架与“今天，从容开始。”概览页。

---

## 十八、全屏排课表深色模式（2026-11-18）

### 1. 组件

- `RoomScheduleBoard.tsx` 新增 `useBoardTheme()`：`theme` 状态为 `"light" | "dark"`，初始值读 `localStorage.getItem("wellness_board_theme")`，变化时写回；根节点 class 由 `room-board` 改为 `room-board ${theme}`。
- 标题栏 `.room-board-tools` 内、关闭按钮之前插入切换按钮 `.room-board-theme`，图标按当前模式取 `moon`（浅色态）/ `sun`（深色态），`title` 与 `aria-label` 均为中文提示。
- `src/components/UI.tsx` 的 `IconName` 与 `paths` 补充 `sun`、`moon` 两个图标（24×24 线性图标，风格与既有图标一致）。

### 2. 样式

- 深色配色统一写在 `.room-board.dark` 作用域下（`src/styles.css` 末尾），只覆盖大屏自身的类，不影响后台其他页面：底色 `#0c1917`、表头 `#162522`、网格线 `rgba(255,255,255,.07)`、次要文字 `#8ba79b`、主文字 `#eef5f0`。
- 课程色块用 `color-mix(in srgb, var(--course-color) 42%, #101d1a)`，保留课程色相的同时适配深底；教室占用块用深琥珀 `#33291a` 与深蓝 `#1a2e39`。
- `@media print` 中补一组覆盖：无论大屏当前是哪种模式，打印一律输出浅色版本（背景、网格线、文字与色块全部还原为浅色），避免白纸上打印出浅色字。

### 3. 验证

- `npm run build` 通过。
- CDP 实测：打开大屏时 class 为 `room-board light`、`localStorage` 写入 `light`；点击切换按钮后 class 为 `room-board dark`、背景 `rgb(12, 25, 23)`、标题文字 `rgb(243, 248, 245)`、`localStorage` 为 `dark`；关闭后重新打开仍为 `room-board dark`。
- 截图核对：浅色与深色两版大屏（`public/changelog-2026-11-18/32-room-board.jpg`、`35-board-dark.jpg`）。
