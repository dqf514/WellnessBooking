# 音昱 Wellness OS 更新日志（开发者版）

**更新周期：** 2026-11-09 至 2026-11-28
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

- 新增 `public/changelog-2026-11-18.html`（该文件已于 2026-11-23 更名为 `public/changelog-details.html`）：独立静态页面（无构建依赖，直接由 `SPAStaticFiles` 伺服），按“需求 → 实现 → 画面”逐条对照 2026-11-17 的 14 条需求与 2026-11-18 的 6 组改动，并附 26 张界面截图与图注。
- 截图资源置于 `public/changelog-2026-11-18/`（现已更名为 `public/changelog-images/`），统一压缩到宽 1500px 以内，四张大图转 JPEG 控制体积（合计约 5MB）。
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
- 新增 `src/pages/admin/settings/ChangelogSettings.tsx`：版本卡片 + 按日期分界的时间线，右上角链接到完整图文说明页 `/changelog-2026-11-18.html`（现为 `/changelog-details.html`）。
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
- 截图：`public/changelog-images/32-room-board.jpg`、`33-rooms-blocks.jpg`、`34-dashboard-schedule.jpg`。

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
- `public/help.html` 顶部的“进入员工后台”、内页的“打开员工后台”，以及 `public/changelog-details.html` 顶部的“进入员工后台”同步改为 `/admin`。
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
- 截图核对：浅色与深色两版大屏（`public/changelog-images/32-room-board.jpg`、`35-board-dark.jpg`）。

---

## 二十、报表中心：多维度报表与 Excel 导出（2026-11-22）

### 1. 新增 `backend/app/report_service.py`

- 统一报表引擎：`DATASETS` 定义四个数据源（`transactions` 财务流水、`sessions` 课程排课、`bookings` 预约消课、`members` 会员经营），每个数据源声明可分组维度与可统计指标。
- 指标汇总方式支持 `sum` / `count` / `avg` / `rate`（`num`/`den` 比率），维度可多选组合，输出统一为 `{ columns, rows, totals, row_count }`。
- `REPORT_PRESETS` 预置销售、财务、教学管理、总经理、会员经营五类报表，前端可在预设基础上自由调整维度与指标。
- 维度值在服务端统一转为中文（类别、结账方式、入账类型、课程类型、排课/预约状态、到期状态），前端与 Excel 无需再做映射。

### 2. `finance_service` 拆分到流水级

- `recognized_revenue()` 拆出 `revenue_breakdown()`：返回 `ledger_rows`（按流水发生日归属期间）与 `revenue_rows`（按确认日归属期间，均摊取摊销起始日）以及原有汇总口径，`recognized_revenue()` 保持为汇总视图，报表数字与 `/api/admin/reports` 完全一致。
- 新增 `_amortization_date()` 处理均摊营收的期间归属；私教消课隐含营收同样生成 `revenue_rows`，不再只进汇总不进明细。

### 3. 新接口与导出

- 新增路由 `backend/app/routers/admin_reports.py`：`GET /api/admin/reports/options`（数据集、维度、指标、预设）、`GET /api/admin/reports/table`（按维度汇总）、`GET /api/admin/reports/table.xlsx`、`GET /api/admin/reports.xlsx`（经营总览多页签）；权限统一用 `require_reports`，GET 自动走 API Key `read` scope。
- `export_service` 新增 `build_sheets_workbook()`（多页签工作簿），`build_table_workbook()` 改为其单页包装。
- 移除 `GET /api/admin/reports.pdf` 与 `pdf_service.report_pdf()`，报表一律导出 Excel；`transactions.pdf` 与账单小票 PDF 保持不变。

### 4. 前端

- `ReportsPage` 重写为报表中心：顶部标签切换经营总览与五类预设报表及自定义报表；自定义区提供数据源、分组维度、统计指标、统计区间四个选择区，改动即时重查；表格含合计行。
- 新增样式 `.report-builder`、`.picker-chip` 与表头合计行样式；后台菜单“报表分析”更名为“报表中心”，新增后台文案翻译。

### 5. 验证

- `npm run build` 通过；`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（17 章、137 个接口）。
- 接口实测：四个数据源分组统计结果与既有报表口径一致（现金实收 30064、确认营收 10064）；`table.xlsx` 与 `reports.xlsx` 用 openpyxl 复读校验，表头、页签与合计行正确。
- 截图核对：经营总览、销售业绩、财务报表与自定义报表四个标签页。

---

## 十九、会员照片、Excel 名单导出与会员卡操作重构（2026-11-22）

### 1. 会员照片

- `Member` 新增 `photo_url`（`models.py` + `ensure_schema()` 同步补列），`upload_service.save_image()` 校验 PNG/JPG/WebP 魔数并落盘到 `backend/uploads/members/`；替换照片时调用 `remove_upload()` 清理旧文件。
- 后台：`POST /api/admin/members/{member_id}/photo`（multipart `file`）、`DELETE /api/admin/members/{member_id}/photo`；会员端：`POST /api/public/me/photo`、`DELETE /api/public/me/photo`。写操作均写操作日志。
- `upload_service.image_size()` 用 `seek/tell` 取字节数，避免 `SpooledTemporaryFile` 没有 `getvalue()` 的异常。

### 2. Excel 名单导出

- 新增 `backend/app/export_service.py`：`build_member_workbook()` 用 openpyxl 生成 `.xlsx`，会员照片以 `openpyxl.drawing.image.Image` 嵌入 `B{row}` 单元格（行高 72、冻结首行），`build_table_workbook()` 提供通用表头 + 数据行的工作簿生成器。
- 导出范围：`all`（全部会员）/ `new`（统计月份新进）/ `renew_pending`（统计月份未续会）；`GET /api/admin/export/members.xlsx`（GET 走 `read` 权限，无需改 API Key scope 映射）。
- `ensure_schema()` 之外无表结构变更；`openpyxl` 与 `Pillow` 加入 `backend/requirements.txt`。

### 3. 会员卡操作重构

- `MemberCard` 新增 `frozen_from`（冻结开始日）、`is_renewal`（续卡标记），`Transaction` 新增 `is_renewal`；`card_service.issue_card()` 增加 `is_renewal` 参数并同步写入流水。
- `PATCH /api/admin/cards/{card_id}` 新增 `edit` 动作（直接改 `starts_on` / `expires_on` / `note`）与 `freeze` 动作的 `frozen_from`；`booking_service._card_usable()` 的冻结判断改为区间内停用，区间外照常可用。
- 升卡放开同类目限制，升级目标按卡种分组（前端 `<optgroup>`）。

### 4. 开卡日期待定

- `MemberCard` 新增 `start_pending`、`opened_booking_id`；`issue_card(start_pending=True)` 时 `starts_on` / `expires_on` 留空。
- `booking_service.find_available_card()` 放宽有效期过滤并把待定卡排在最后（优先消耗已开卡的卡）；`consume_booking()` 首次签到时调用 `_open_pending_card()`：起始日为签到当天、到期日 = 起始日 + 产品有效期，均摊口径的购卡流水同步改写 `revenue_start_on` / `revenue_days`。
- `restore_consumption()` 调用 `_revert_pending_card()`：撤销签到把卡退回待定状态并清空均摊起始日。
- `finance_service._amortized_amount()` 对待定卡返回 0，未开卡不确认营收；`admin_core.list_members` 的 `card_status` 新增 `pending`。

### 5. 营收口径收归系统设置

- `AppSettings` 新增 `revenue_mode`（`auto` / `immediate` / `amortized`），`finance_service.system_revenue_mode()` 读取设置，`resolve_purchase_revenue_mode()` 结合卡种给出实际口径（私教与评估恒为 `none`）。
- 购卡与升卡不再接受前端传入的 `revenue_mode`；`GET /api/admin/revenue-policy?product_id=` 返回当前口径供前端展示（权限 `revenue.write`，GET 走 `read` scope）。
- 前端 `EntryOptionsFields` 新增 `lockedRevenueMode` 只读模式；`GeneralSettings` 新增“营收确认口径”下拉。

### 6. 验证

- `npm run build` 通过；`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（17 章、134 个接口）。
- 接口实测：待定卡购买 → 签到自动开卡（起始日 = 课程日期、到期日 = +有效期、次数扣减）→ 撤销签到退回待定（次数返还）；系统设置切换 `amortized` / `immediate` / `auto` 后购卡流水的营收方式随之变化，私教卡始终为 `none`；非法 `revenue_mode` 返回 400。
- 截图核对：购卡弹窗（开卡方式 + 营收口径只读提示）、系统设置营收口径区块。

---

## 二十一、财务：结账方式筛选与合计口径（2026-11-22）

### 1. 结账方式筛选

- `finance_service.revenue_breakdown()` 新增可选筛选参数 `category`、`member_id`、`payment_methods`，在遍历流水与追加私教消课营收行时统一过滤；`recognized_revenue()` 透传同样的筛选。
- `finance_service.category_matches()` 统一类别归类（私教/评估、年卡/组合套餐），`CATEGORY_ALIASES` 与 `query_transactions` 的历史类别映射保持一致。
- `admin_finance.query_transactions()` 新增 `payment_method`（逗号分隔，支持多选）；`GET /api/admin/transactions` 与 `GET /api/admin/transactions.pdf` 均支持该参数。

### 2. 合计口径

- `admin_finance.finance_totals()` 返回流水总额（已扣退款）、营收总额（已扣退款，按系统设置口径确认）、退款总额三项；流水列表接口一并返回 `revenue_amount` 与 `refund_amount`。
- `pdf_service.transactions_pdf()` 抬头合计改为「记录数量 / 流水总额（已扣退款）/ 营收总额（已扣退款）/ 退款总额」，副标题补充当前类别与结账方式。
- 前端 `FinancePage` 三张合计卡同步改名，并新增结账方式多选筛选条（`.picker-chip` 样式，导出 PDF 沿用当前筛选）。

### 3. 报表中心结账方式筛选

- `report_service._apply_filters()` 支持 `payment` 过滤（结账方式 key → 中文标签）；`report_options()` 的 `filters` 增加结账方式可选项。
- `GET /api/admin/reports/table` 与 `/api/admin/reports/table.xlsx` 新增 `payment` 查询参数；前端报表中心在财务流水数据源下显示结账方式下拉。

### 4. 验证

- `npm run build` 通过；`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（17 章、137 个接口）。
- 接口实测：`/api/admin/transactions` 全量返回 `total_amount=30064`、`revenue_amount=10064`、`refund_amount=0`；按 `payment_method=wechat,cash` 过滤后一致；`/api/admin/transactions.pdf` 抬头显示四项合计与结账方式。

---

## 二十二、会员端交互改版与手机端教室总览（2026-11-22）

### 1. 会员端登录简化

- `public.py` 的 `member_login` 接受仅 `phone` + `code` 的请求体，姓名为空时自动生成 `会员{后四位}` 显示名（新会员自动建档），前端 `PublicHome` 移除姓名输入框。
- `src/context/LanguageContext.tsx` 新增 `PHONE_KEY = "wellness_member_phone"`，登录成功后写入手机号，下次打开自动回填。
- 验证码改为打开登录弹窗即自动发送：`PublicHome` 用 `codeSent` ref 记录已发送的手机号号码，配合 60 秒倒计时避免重复发送；换号后需手动重发。

### 2. “已约”状态与一键取消

- `public.py` 的 `public_sessions` 新增可选依赖 `optional_member`（`Depends(bearer)` 解析 `sub` 前缀为 `member:` 的令牌），命中会员时按 `session_id` 汇总其 `booked` 预约并在返回项上打 `booked` 标记，匿名访问恒为 `false`。
- `src/types.ts` 的 `Session` 增加可选字段 `booked?: boolean`。
- 前端课表行与详情弹窗共用同一按钮：`session.booked` 为真时显示「已约」并改为调用 `cancelSessionBooking()`（`DELETE /api/public/bookings/{id}`），取消成功后刷新课表与我的预约。

### 3. 手机端折叠区与大字体适配

- `PublicHome` 的「身心引导者」「会员卡课」在 ≤700px 时改为 `<button class="section-toggle">` 点按展开，桌面端 `.section-toggle` 为 `display: none`，布局保持原样。
- 日期条改为 `grid-template-columns: repeat(7, minmax(0, 1fr))` + `clamp()` 字号 + `white-space: nowrap`，修复大字体下最后一天被裁切的问题。

### 4. 弹窗内报错可见性（需求 9）

- `styles.css` 新增规则：`.modal-backdrop` 存在时，页面级 `.notice-error`（不含弹窗内部的那条）改为 `position: fixed; z-index: 220` 浮到弹窗之上；若弹窗内部已有 `.notice-error`，则隐藏页面级那一条，避免同一条错误显示两遍。
- 未引入额外的事件总线，所有后台页面零改动即可生效。

### 5. 手机端教室总览（需求 16）

- `RoomsPage`：教室色块条在手机端改为显示（`.room-scroll-strip` 不再在 ≤700px 隐藏），点击色块跳转到对应分页；新增 `room-compact-list` 紧凑列表，按教室列出当天全部课程与占用，手机端一次看全所有教室。
- `RoomScheduleBoard`：新增 `compact` 判定（`matchMedia("(max-width: 700px)")`），手机端改用固定格宽（列 132px、行高 46px）并把时间轴与列网格包进 `.room-board-canvas`，通过 `transform: translate() scale()` 实现双指捏合缩放（0.5–3 倍）与单指拖动画布，另加缩放比例、放大、缩小与复位按钮；桌面端布局与铺满逻辑完全不变。
- `.room-board-action`（全屏排课表）在手机端不再隐藏。

### 6. 验证

- `npm run build` 通过（`tsc -b` 无报错）。
- CDP 截图核对：手机端教室总览（色块条 5 个、紧凑列表 5 张卡片）、手机端全屏排课表（缩放控件存在、缩放后 `transform: translate(-39px, -73.8px) scale(1.2)`）、弹窗打开时页面级报错 `position: fixed`、`z-index: 220`。
- `python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（17 章、137 个接口），`docs/API.md` 补充 `/api/public/sessions` 的 `booked` 字段说明。

---

## 二十三、会员端手机多页模式（2026-11-23）

### 1. 页面模型

- `src/pages/PublicHome.tsx` 新增 `type MobilePage = "home" | "schedule" | "guides" | "cards" | "me"` 与 `mobilePage` / `compact` 状态；`compact` 由 `window.matchMedia("(max-width: 700px)")` 驱动并监听 `change` 事件实时切换。
- 根节点 `<div className="public-site">` 上带 `data-mobile-page={mobilePage}`，各内容区块带 `data-page`（`home` / `schedule` / `guides` / `cards` / `me`）与 `data-active`（仅当前页为 `"true"`）。

### 2. 显示逻辑（CSS 驱动，不改动桌面端）

- `styles.css`：`@media (max-width: 700px)` 下 `.public-site [data-page]:not([data-active="true"]) { display: none !important; }`；`@media (min-width: 701px)` 下 `.public-site [data-page="me"] { display: none !important; }`。
- 桌面端所有 `data-page` 区块照旧整页滚动，底部导航 `.mobile-bottom-nav` 仍为 `display: none`。

### 3. 底部导航

- 底部导航由 3 个入口改为 5 个按钮（首页 / 预约 / 引导者 / 卡课 / 我的），当前页按钮加 `.active`（加深加粗）。
- `grid-template-columns` 由 `repeat(3, 1fr)` 改为 `repeat(5, 1fr)`。

### 4. 「我的」独立页面

- 抽出 `mePanel()` 函数复用原弹窗内容（个人信息 / 我的预约 / 我的会员卡 / 购卡记录 / 到店签到 / 退出登录）：桌面端仍走 `Modal`，手机端渲染在 `<section className="me-page" data-page="me">` 中。
- `openMe(tab?)` 统一入口：手机端切到 `me` 页面，桌面端打开弹窗；`completeOrder()` 改为 `await loadMe(); openMe("orders")`。
- 未登录时手机端「我的」页展示登录按钮，点击直接打开登录弹窗。

### 5. 移除折叠区

- 删除上一批引入的 `.section-toggle` 折叠按钮与 `.teacher-grid:not(.is-open)` / `.product-grid:not(.is-open)` 隐藏规则——多页模式已承担「按需展开」的职责。

### 6. 验证

- `npm run build` 通过（`tsc -b` 无报错）。
- CDP 截图核对：手机端（390×844）底栏 5 个按钮，逐个点击后可见区块分别为 `home` / `schedule` / `guides` / `cards` / `me`；未登录点「我的」弹出登录窗口；登录后「我的」页 `me-tabs` 6 个标签、我的预约 14 条；桌面端（1440×900）可见区块 `home, home, schedule, guides, cards`，底栏 `display: none`。

---

## 二十四、更新说明页面固定为 changelog-details.html（2026-11-23）

### 1. 文件更名与链接固定

- `public/changelog-2026-11-18.html` 更名为 `public/changelog-details.html`，截图目录 `public/changelog-2026-11-18/` 更名为 `public/changelog-images/`，页面内 35 处图片路径同步替换。
- `src/pages/admin/settings/ChangelogSettings.tsx` 的“查看完整图文更新说明”按钮指向 `/changelog-details.html`。
- **约定**：该文件名固定，不再带日期；后续每次更新都在这一页上追加章节，不另建新文件，链接始终使用 `/changelog-details.html`。

### 2. 页面内容更新到 2026-11-23

- 新增 5 个批次章节（BATCH 10 – BATCH 14），覆盖会员照片与名单导出、会员卡操作与开卡日期待定、报表中心与 Excel 导出、财务结账方式筛选与三项合计、会员端交互改版与手机端教室总览、会员端手机多页模式。
- 概览区新增 5 张批次卡片，目录（TOC）同步扩充，接口表补 10 个新接口并注明 `reports.pdf` 已改为 Excel，修复清单补 6 条。
- 新增 28 张界面截图（编号 36 – 63），统一压缩到宽 1500px 内并转 JPEG（q86），`public/changelog-images/` 目录合计约 9MB。

### 3. 验证

- `npm run build` 通过。
- 页面标签配平校验通过（section / article / figure / div / table 等无失衡），65 处图片引用全部存在。
- 后台“系统设置 → 更新日志”的链接指向 `/changelog-details.html` 且可正常打开。

---

## 二十五、图文更新说明改为时间倒叙（2026-11-23）

### 1. 排序规则

- `public/changelog-details.html` 全部按**时间倒叙**排列：最新批次章节在最前、最旧的批次在最后，概览批次卡片、目录（TOC）、修复清单同步倒序。
- 章节顺序：`overview` → `batch-1123`（2026-11-23）→ `batch-1122d` → `batch-1122c` → `batch-1122b` → `batch-1122a` → `batch-1118h` … → `batch-1117`（2026-11-17）→ `matrix` → `fixes` → `api` → `member-site`。
- 概览卡片按 `BATCH 14` → `BATCH 01` 倒序；目录日期从 `2026-11-23` 递减到 `2026-11-17`。
- **后续约定**：每批更新追加的新章节一律插在 `overview` 之后、`matrix` 之前，概览卡片插到最前，TOC 条目插到批次列表首位。

### 2. 图片编号

- 63 张截图的题注按新顺序重新连续编号（图 1 – 图 63），原有“图 57 – 图 63”交叉引用已删除。

### 3. 首屏文案

- 主标题改为「会员端全面改版，报表与财务口径再收紧」，两段导语调换为先 11-22/23 后 11-17/18；修复数量统计由 13 修正为 12。

### 4. 验证

- `npm run build` 通过。
- 页面标签配平校验通过，63 处图片引用全部存在、题注编号 1–63 连续无断号。
- CDP 截图核对（1440×1000）：目录与概览卡片均为倒序，最新章节 `BATCH 14` 位于正文最前。

---

## 二十六、操作指南同步更新（2026-11-23）

### 1. `public/help.html` 补充内容

- **会员档案与会员卡**：新增「上传会员照片」步骤（后台档案上传 / 会员端自助拍照，照片显示在档案头像、会员清单与签到名单）；新增「4. 会员卡操作速查」小节（续卡＝重新购卡、请假 / 停卡与解冻、跨类目升卡、开卡日期待定于首次签到时起算）与「5. 导出会员名单」小节（全部会员 Excel 含照片列、当月新进会员、当月未续会会员、CSV 档案）。
- **场馆、预约规则与品牌**：新增「3. 营收确认口径」小节，说明「系统设置 → 场馆与预约 → 营收确认口径」的三种选项（自动按卡种判定 / 购买时全额确认 / 按有效期每日摊销），并注明私教与评估卡始终按实际消课确认营收。
- 同步扩充 `data-search` 关键词（照片、续卡、请假、停卡、开卡日期待定、跨类目升卡、导出名单、excel、营收口径等），侧边栏搜索可直接命中。

### 2. 约定

- 每次功能更新收尾时，除 `public/changelog-details.html` 外，还要检查 `public/help.html`（后台侧边栏「操作指南」入口）是否需要补充对应章节——操作步骤变化或新增入口必须同步。

### 3. 验证

- `npm run build` 通过。
- `public/help.html` 标签配平校验通过（details / div / article / ul / ol / li / p / h3 无失衡），新增 4 个小节渲染正常（CDP 截图核对 1440×1000）。

---

## 二十七、照片上传增加裁剪窗口（2026-11-23）

### 1. 新增 `src/components/PhotoCropper.tsx`

- 通用裁剪弹窗：入参 `file` / `aspect` / `allowOriginal`，回调 `onConfirm(file)` 与 `onCancel()`。
- 预览用 `<canvas>` 绘制，与导出共用同一套换算，保证“所见即所得”；导出为 640 × 640 的 JPEG（q0.9，白底）。
- 交互：指针拖动平移（Pointer Events，兼容触屏）、滑块缩放 1×–3×、滚轮缩放、重置；偏移量按 cover 比例夹取，不会拖出空白。
- 不引入任何第三方依赖，手写 CSS 放在 `src/styles.css`（`.photo-cropper` / `.photo-crop-frame` / `.photo-crop-zoom` / `.photo-crop-actions`）。

### 2. 接入点

| 位置 | 文件 | 比例 | 说明 |
| --- | --- | --- | --- |
| 会员端“我的 → 个人信息 → 会员照片” | `src/components/MemberProfilePanel.tsx` | 1:1 | 选图后先裁剪，确认才上传 |
| 后台会员档案“上传照片” | `src/components/MemberProfileDrawer.tsx` | 1:1 | 前台可代会员调整取景 |
| 后台教练管理“教练照片” | `src/pages/admin/settings/CatalogSettings.tsx` | 120:140 | 竖版取景，与列表展示框一致 |
| 后台课程库“课程图片” | `src/pages/admin/CoursesPage.tsx` | 1:1 | 另提供“使用原图”跳过裁剪 |

- 上传接口未变（`POST /api/admin/members/{id}/photo`、`POST /api/public/me/photo`、`/api/admin/teachers/{id}/photo`、`/api/admin/courses/{id}/image`），仍接收 PNG / JPG / WebP；裁剪后前端统一提交 JPEG。
- 文件输入框在选择后清空 `value`，可重复选择同一张图片。

### 3. 文档同步

- `public/help.html`：会员端新增「6. 上传本人照片」，会员档案新增「裁剪成头像的样子」步骤，课程与教室排期新增图片裁剪说明，并扩充相关 `data-search` 关键词。
- `public/changelog-details.html`：新增 BATCH 15 章节与概览卡片，目录置顶；原 63 张截图整体后移 4 位（编号 01–63 → 05–67），新增 4 张裁剪窗口截图，题注重新连续编号（图 1 – 图 67）。
- `docs/CHANGELOG_CLIENT.md`、`src/lib/changelog.ts`（后台“系统设置 → 更新日志”）同步新增本次条目。

### 4. 验证

- `npm run build` 通过（`tsc -b` 无报错）。
- CDP 实测：会员端（390×844）上传照片 → 裁剪窗口弹出 → 确认裁剪 → 提示“照片已更新”，保存结果为 640 × 640；后台会员档案同样流程通过；教练照片裁剪框为 300 × 350（竖版），课程图片裁剪框为 300 × 300 且带“使用原图”按钮。

## 二十八、登录安全：图片验证码 + 短信二次验证 + 演示账号开关（2026-11-23）

### 1. 后端新增

| 文件 | 作用 |
| --- | --- |
| `backend/app/captcha_service.py` | 生成 4 位图片验证码（Pillow 绘制：旋转、干扰线、噪点），一次一用、5 分钟过期、同图最多 5 次；答案用 `hash_otp` 哈希存放，内存保存挑战 |
| `backend/app/mfa_service.py` | 二次验证挑战令牌（内存、5 分钟、5 次上限）与手机号掩码 |
| `backend/app/runtime_flags.py` | `demo_login_enabled(db)` / `demo_login_locked()`：后台开关与环境变量 `LOGIN_DEMO_CREDENTIALS` 的合并判断 |

- `app_settings` 新增三列：`demo_login_enabled`（默认 1）、`captcha_enabled`（默认 1）、`mfa_enabled`（默认 0），同步写入 `ensure_schema()` 的 `additions`。
- `config.py` 新增 `LOGIN_DEMO_CREDENTIALS`：留空跟随后台设置，值为 `0/false/no/off` 时强制关闭演示账号。
- `POST /api/auth/login` 现在先校验图片验证码（`captcha_id` + `captcha_text`），再校验口令；开启 MFA 时返回 `{ mfa_required, mfa_token, phone_masked }` 而不发令牌。
- 新增 `GET /api/auth/captcha`（返回 `captcha_id` + base64 PNG）与 `POST /api/auth/login-mfa`（校验挑战令牌 + 短信验证码换取令牌）。
- `GET /api/public/app-config` 返回 `{ demo_login, captcha }`，登录页据此决定是否预填与是否显示验证码框。
- `GET/PUT /api/admin/settings` 增加 `demo_login_enabled`、`demo_login_locked`（只读）、`captcha_enabled`、`mfa_enabled`。

### 2. 前端

- `src/pages/LoginPage.tsx`：改为拉取 `app-config` 后再决定预填；新增验证码图片（点击刷新）与输入框；MFA 步骤独立成「二次验证」面板（显示掩码手机号、返回重新登录）；提交失败自动换一张新验证码。
- `src/pages/admin/settings/GeneralSettings.tsx`：新增「登录安全」分区（图片验证码 / 短信二次验证）与「测试期登录便利」分区（演示账号开关，环境变量强制关闭时置灰并给出说明）。
- `src/styles.css`：新增 `.captcha-row` / `.captcha-input` / `.captcha-image` / `.login-back-step`。

### 3. 短信默认措辞

- `sms_service.DEFAULT_BOOKING` / `DEFAULT_CANCEL` 去掉「预约编号{id}」，避免被运营商判为敏感词导致发送失败；模板仍可在后台自由改写（接口与界面不变）。

### 4. 验证

- `npm run build` 通过（`tsc -b` 无报错）。
- 接口级：错误验证码 / 缺验证码均返回 `400 图片验证码错误或已过期`；正确验证码登录成功；开启 MFA 后登录返回 `mfa_required`，错误验证码 `400`，正确验证码换取令牌 `200`。
- CDP 实测：登录页自动带出验证码图片与演示账号 → 输入验证码 → 进入工作台；开启 MFA 后页面切换到「二次验证」并显示掩码手机号，输入短信验证码后进入工作台；后台「登录安全」开关渲染与保存正常。

## 二十九、需求修订批次：名单卡种、评估独立、通知群发与 Outlook 导入（2026-11-26）

依据 `modify1125.pdf`（6 页 12 条修订）实现，覆盖前端、后台接口、计划任务与文档。

### 1. 会员名单与导出按卡种筛选

- `finance_service` 新增 `category_matches_any(category, wanted_list)`，复用既有 `CATEGORY_ALIASES`（`assessment→private`、`package→annual`），使列表筛选、导出筛选、排序与统计四处的卡种口径完全一致。
- `GET /api/admin/members` 新增 `sort` 参数（`card` 默认 / `name` / `joined`），响应新增 `card_stats`（按卡种统计人数）。`category` 多选改用 `category_matches_any`。
- `export_service` 新增 `member_card_sort_key` 与 `member_card_stats`；`GET /api/admin/export/members.xlsx` 新增 `categories`（卡种多选）与 `only_cards`（默认 `true`，只导出真正买过卡的客户）参数，`scope=new|renew_pending` 同样受此约束。
- 前端 `MembersPage` 增加排序下拉、导出弹窗（范围 + 月份 + 仅导出已购卡客户 + 卡种多选）、卡种人数统计条；「新建会员」改称「新建客户」，「套餐」改称「年卡/组合套餐」。

### 2. 评估预约独立与会员档案直达

- `BookingsPage` 支持 `assessment` 路由类型：课程查询用 `course_type=assessment`，签到只匹配卡权益里的评估项，避免误扣私教次数；新增「评估预约」侧边栏入口与 `/admin/bookings/assessment` 路由（`/admin/schedule/assessment` 旧路径重定向）。
- 私教/评估名单中的会员名改为按钮，点击直接打开 `MemberProfileDrawer`（可同时编辑姓名、英文名、手机号、性别、生日、备注，保存后刷新名单）。
- `MemberProfileDrawer` 档案头部样式整体放大（照片 96px、标题 30px、事实项最小列宽 190px，auto-fit 自动折行）；后续按需求二次优化为「照片与姓名在左（100px 头像 / 30px 标题）、详细信息在右固定 4 列两行（标签 15px / 数值 18px，列间距 18px）」，`.profile-summary` 改为 `grid-template-columns: max-content minmax(0, 1fr)`，备注行 `grid-column: 1 / -1` 整行铺开；≤1200px 改为上下堆叠、≤960px 与 ≤700px 事实项降为 2 列，`.profile-facts > span` 允许换行兜底，长内容不会被截断。`.profile-head h2` 再改为纵向排列（`flex-direction: column`），英文名改到中文名下方，标题栏宽度随之收窄。

### 3. 购卡与升卡的入账口径可逐单选择

- `POST /api/admin/members/{id}/cards` 与 `POST /api/admin/cards/{id}/upgrade` 统一改为「系统默认口径 + 前台逐单调整」：请求可传 `record_cash`、`revenue_mode`、`revenue_start_on`、`revenue_days`，未传时回落到 `resolve_purchase_revenue_mode` 的设置值。
- 均摊模式下校验 `revenue_days`（1–3650）与 `revenue_start_on`；升级流水的 `cash_basis` 现在随选项写入，审计详情补充 `record_cash` 与 `revenue_mode`。
- 前端购卡与升卡弹窗恢复 `EntryOptionsFields`，并显示当前默认口径与「系统设置 → 财务口径」提示。

### 4. 会员群发通知（新增 `member_notices`）

- `models.py` 新增 `MemberNotice`（`title`、`content`、`send_on`、`scope`、`member_ids`、`status`、`sent_count`、`failed_count`、`sent_at` 等），`create_all` 自动建表。
- `notice_service.py`：`SCOPE_LABELS`、`notice_dict`、`_target_members`、`send_notice`（走 `sms_service.deliver`，失败不中断）、`send_due_notices`。
- `routers/admin_notices.py`：`GET/POST /api/admin/notices`、`POST /api/admin/notices/{id}/send`、`POST /api/admin/notices/{id}/cancel`，均带能力门与 `audit()`。
- `scheduler.py` 在 20 秒轮询里于 `send_due_reminders` 之后调用 `send_due_notices`；`deps.required_api_key_scope` 把 `/api/admin/notices` 归入 `members:write`。
- 前端新增 `NoticesPage`：列表、创建（标题/内容/日期/范围/指定会员多选）、立即发送、取消，内置「预约系统切换」模板与「下载会员操作指南」按钮。

### 5. 会员手机端操作指南 PDF

- `member_guide_service.py`：7 个章节（桌面快捷方式、登录、预约团课、取消团课、课程介绍、老师资料、会员卡与预约），`PhoneScreen` 自绘示意图 + 步骤表 + 提示框，A4 纵向、`STSong-Light` 中文字体。
- 新增 `GET /api/public/member-guide.pdf`（公开、`inline`、不缓存）；前端在通知页一键下载。

### 6. Outlook 会议室日历导入

- `ics_service.py`：手写 ICS 解析，支持折行展开、`DTSTART;TZID=`、UTC（`Z` 转 +8）、全天事件与 `RRULE:FREQ=WEEKLY` 重复展开（上限 60 条）。
- `POST /api/admin/room-reservations/import-ics`：按 `room_id` 或 `LOCATION` 匹配教室，按 `UID` 去重，冲突跳过；`room_reservations` 新增 `external_uid`、`source` 两列（同步写入 `ensure_schema()` 的 `additions`），导入的占用 `usage_type="outlook"`。
- 前端 `RoomsPage` 新增「导入 Outlook 日历」弹窗（导出说明、教室选择、.ics 选择、冲突提示），占用类型新增「Outlook 会议」与图例。

### 7. 其他修正

- `ColorPicker` 移除无法展开的「更多颜色」，改为提示点击左侧色块，并补齐常用色。
- `docs/API.md` 新增第 4.19、8.30、18 节并更新成员列表 / 导出参数与 API Key scope 描述；`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（18 章 / 146 个接口）；`API_ENDPOINT_COUNT` 同步为 146。

## 三十、后台导航栏可折叠为图标栏（2026-11-26）

### 1. 组件与状态

- `src/layouts/AdminLayout.tsx`：新增常量 `SIDEBAR_KEY = "wellness_admin_sidebar_collapsed"` 与 `collapsed` state（`useState` 初始化时读 `localStorage`，避免刷新后闪烁）；`toggleSidebar()` 切换时写入 `"1"` / `"0"` 持久化。
- 侧边栏头部抽出 `.admin-sidebar-head` 容器，把品牌区与折叠按钮并排（品牌链接 `flex: 1`，按钮 `flex: 0 0 auto`）；按钮用 `Icon name="chevron"` 旋转 180° 指向左侧表示「折叠」，折叠态下取消旋转表示「展开」，并带 `title` / `aria-label` / `aria-expanded`。
- `.admin-shell` 增加 `collapsed` 修饰类，折叠时整体收窄到 78px；所有导航项（含分组标题、子项、个人中心）补 `title` 属性，图标态下悬停即可看到名称。
- 分组子菜单在折叠态沿用原有的 `:hover` 浮层机制（`.admin-nav-children` 绝对定位在 `left: 100%`），并用 `.admin-shell.collapsed .admin-nav .admin-nav-children a span { display: inline; }` 保证浮层内的文字不被隐藏。

### 2. 样式

- `src/styles.css` 新增 `.admin-sidebar-head` / `.sidebar-collapse-btn` 基础样式与 `@media (min-width: 961px)` 下的 `.admin-shell.collapsed` 规则集：栅格列 `78px minmax(0, 1fr)`、隐藏品牌文字与各菜单文字、菜单项居中、`.sidebar-quick` 与 `.sidebar-user` 改为纵向排列、`.sidebar-profile-glyph` 显示为图标。
- `@media (max-width: 960px)` 内隐藏折叠按钮（该断点侧边栏本就是自动图标栏，避免出现两个含义相同的状态），并同步给 701–960px 的自动图标模式补上 `.sidebar-quick` / `.sidebar-user` 纵向排列，避免 78px 窄栏溢出；≤760px / ≤700px 恢复横向排列。

### 3. 验证

- `npm run build` 通过（`tsc -b` 无报错）。
- CDP 实测：1600px 展开态点击折叠按钮后 `.admin-shell` 变为 `collapsed`、栅格列变为 `78px 1507px`；底部快捷按钮与个人中心全部可见不溢出；用 `Input.dispatchMouseEvent` 悬停分组标题，子菜单浮层在右侧正常展开且文字完整。

## 三十二、会员名单分页与表格排版（2026-11-26）

### 1. 后端：向后兼容的分页参数

- `GET /api/admin/members` 新增可选查询参数 `page: int | None = Query(None, ge=1)` 与 `page_size: int = Query(50, ge=1, le=200)`。
- **不传 `page` 时仍返回整份名单**（旧行为保留），其它调用方（导出、报表）不受影响；传 `page` 时返回 `{ items, total, page, page_size, pages, card_stats }`。
- `card_stats` 始终按**筛选后的全量集合**统计，卡种人数不会因为分页而变少。
- 新增 `GET /api/admin/members/options`：只返回 `{id, name, name_en, phone, active}` 的精简名单，带 `q` / `active_only` / `limit`（上限 20000）参数，供下拉与侧边清单使用。
- **路由顺序**：`/api/admin/members/options` 必须声明在 `/api/admin/members/{member_id}` 之前，否则会被 int 路径参数捕获并返回 422。

### 2. 前端：分页与下拉数据源拆分

- `src/pages/admin/MembersPage.tsx` 增加 `page` / `pageSize` / `total` / `pages` 状态，`loadMembers` 带上分页参数；切换搜索、卡种、排序、每页条数时统一 `setPage(1)`。
- 新增 `loadMemberOptions()`（`useRef` 守卫，只加载一次）拉取精简名单，供会员档案侧边清单使用；未加载完成时回退到当前页数据。
- `src/components/MemberPicker.tsx` 与 `src/components/MemberProfileDrawer.tsx` 的入参改为 `MemberOption[]`；`MemberPicker` 客户端过滤并把 datalist 限制在 60 条，`MemberProfileDrawer` 增加搜索框且列表限制在 40 条。
- `src/types.ts` 新增 `MemberOption` 接口，`Member` 继承自它。
- `BookingsPage` / `FinancePage` / `NoticesPage` 改用 `/api/admin/members/options`，避免拉取含卡课与档案详情的完整名单。

### 3. 样式

- `src/styles.css` 新增 `.members-table`：`table-layout: fixed` + `min-width: 1180px` + 各列百分比宽度，长内容不再压缩相邻列。
- 全局 `overflow-wrap: anywhere` 会让手机号在数字中间断行，表格内统一覆写为 `normal` / `keep-all`，仅姓名列保留 `anywhere`。
- 全局 `input, select, textarea { width: 100% }` 会让分页栏的「每页条数」下拉占满整行导致按钮被压扁，`.member-pagination select { width: auto }` 覆写，并给按钮加 `flex: 0 0 auto`。
- 卡片标签 `.member-cards .badge` 改为可换行、`text-align: left`，多张卡依次排列。

### 4. 验证

- 实测：不分页 5,240 条 / 2.79 MB / 0.89 s；分页（每页 50）返回 50 条 / 194 KB / 0.27 s，`total=5240`、`pages=105`。
- `GET /api/admin/members/options?limit=20000` 返回全部精简名单；带 `q` 时响应体大幅缩小。
- CDP 截图核对桌面端、移动端、长姓名行、分页栏、档案侧边搜索框；`/admin/bookings`、`/admin/finance`、`/admin/notices`、`/admin/members` 四个页面无报错提示。
- `npm run build` 通过。

### 5. 文档

- `docs/API.md` 第 6 章接口数 22 → 23，新增 `GET /api/admin/members/options` 说明并补充分页参数；`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（18 章 / 149 个接口）。
- `public/help.html` 会员档案章节新增「名单分页翻看」并补充档案侧边搜索说明。
- `public/changelog-details.html` 追加 BATCH 20（3 张截图）、`docs/CHANGELOG_CLIENT.md` / `docs/CHANGELOG_DEVELOPER.md` / `src/lib/changelog.ts` 同步；`API_ENDPOINT_COUNT` 同步为 149。

## 三十一、勤鸟历史数据导入（2026-11-26）

### 1. 数据模型与表结构对齐

- `models.py` 新增 `external_id` 字段（`Member` / `Teacher` / `Room` / `Course` / `ClassSession` / `CardProduct` / `MemberCard` / `Booking` / `ExperienceVoucher` / `MemberRecord` / `Transaction` / `OperationLog`），统一作为导入数据的幂等键（勤鸟主键或可复现的复合键）。
- 按需保留勤鸟原始字段以便追溯：`Member.legacy_category` / `legacy_customer_level`、`Teacher.legacy_position` / `legacy_teacher_type`、`CardProduct.legacy_card_type`、`MemberCard.legacy_card_type` / `legacy_status` / `legacy_source` / `legacy_total` / `legacy_remaining`、`Booking.legacy_source`、`Transaction.legacy_flow_no` / `legacy_business_type` / `legacy_contract_no`。
- `database.py` 的 `ensure_schema()` `additions` 字典同步补齐上述全部列（新增列必须同时改 ORM 模型与 `ensure_schema()`，否则已有库不会自动获得该列）。

### 2. 导入器 `backend/app/legacy_import.py`

- `RocketbirdImporter.run()` 按依赖顺序执行：教室 → 教练 → 课种 → 卡产品 → 会员 → 会员卡 → 补建卡 → 团课排课 → 团课签到 → 私教 → 流水 → 档案记录 → 操作日志。
- 字段映射集中在模块级常量：`PRODUCT_CATEGORY` / `PRODUCT_ALIASES`（月卡→团课月卡、年卡→会员年卡、邀请体验-测试→邀请单次体验卡 等）、`PRODUCT_DEFAULT`（卡名→有效天数与总次数）、`PAYMENT_METHODS`（现金/刷卡/支付宝/微信）、`TRANSACTION_KINDS`（购卡/购私教→purchase、换卡→upgrade、销卡/商品退款→refund、请假/转卡→manual）、`BOOKING_SOURCES`（0/1→后台、2→会员端）。
- 勤鸟各表的课程名存在截断，用 `_name_key()`（归一化后取前 12 个字符）做前缀匹配：12,522 条精确命中、189 条同日同区间模糊命中（`SequenceMatcher ≥ 0.6`）、约 52 条生成合成场次。
- 体验卡（是否体验卡=是）落到 `ExperienceVoucher`，期限卡（总计以「天」结尾）建成不限次的团课卡，会籍套餐用 `benefits_json` 表达有效期权益；状态映射已用完→used、未激活→`start_pending`、请假中→冻结区间。
- `_import_cards_from_purchases()`：勤鸟「会员卡明细」未覆盖的购卡订单按流水补建会员卡（118 张，`external_id="cardx:<流水ID>"`）。
- `_import_private()`：私教排课 + 私教签到按 ±6 小时匹配，消课生成显式的 `kind="consumption"` 流水（金额 = 卡购买价 ÷ 总次数，`revenue_mode="immediate"`、`revenue_sequence=1`、`cash_basis=False`），配合 `finance_service` 对已有购卡流水的私教卡屏蔽隐式确认路径，避免重复计营收。
- `_import_transactions()`：`finance_flow` 落 `Transaction`，`cash_basis` 取「流水号 ∈ 收银流水单号」；勤鸟「收银流水」并入现金口径而不单独建表；退款金额取负并继承原流水的 `revenue_mode`。
- `_import_records()`：协议、同意书、请假与处罚记录落 `MemberRecord(record_type="note")`，仍在生效期的处罚同时写 `Member.no_show_blocked_until`。
- `_import_logs()`：6 个 `uplog_*.csv` 落 `OperationLog`（`actor_role="legacy"`），可用 `include_logs=False` 跳过。
- 入口函数 `import_rocketbird(db, source_dir, *, dry_run=False, include_logs=True)`，演练模式整体回滚。

#### 幂等设计（重复导入同一批数据不产生第二份）

- **外部 ID 必须可复现**：不能用「本次运行的第 N 条」这种计数器写进 `external_id`，否则第二次导入认不出旧数据。全部改成由来源字段拼出来的组合键（`_occ_key()`）：会员卡 `card:<用户ID>:<卡课ID>:<购卡日期>:<同组序号>`、体验券 `voucher:<用户ID>:<卡课ID>:<购卡日期>:<同组序号>`、补建卡 `cardx:<流水ID>`、团课签到 `sign:<签到ID>`、私教 `pt:<排课ID>` / `ptconsume:<排课ID>`、业务流水 `<流水ID>`、档案记录 `rec:op|agr|consent|punish:<主键>`、操作日志 `log:<文件名>:<记录ID>`。组合键超过 `external_id` 的 64 位时用 SHA-1 摘要收敛。
- **同组序号可复现**：勤鸟「会员卡明细」「操作记录」等表没有主键，用 `_occ(base)` 记录同一组合键下的出现序号。CSV 行序固定，所以每次导入算出的序号一致。
- **卡号可复现且唯一**：`member_cards.card_no` 有 UNIQUE 约束，旧实现用运行内自增序号会二次导入直接冲突。改成 `RB<用户ID><卡课ID><购买日><序号>`（补建卡用 `RBX<流水ID>`），由同一组来源字段推导，重跑必然一致。
- **插入前先查**：`_known(kind)` 一次性载入库里已有的 `external_id → 实体 id`，`_claim(kind, external_id)` 判断这条是否已经导过；已存在的会员卡 / 体验券会把实体挂回 `self.cards` / `self.vouchers`，后续「卡 × 会员」匹配与营收计算不受影响。
- **预约另有一道防线**：`bookings` 上有 `(session_id, member_id)` 部分唯一索引（同一会员同一节课只能有一条活跃预约），导入时用 `_known_booking_pairs()` 载入库里已有的「课 × 会员」组合，避免同一场课被拆成多条预约。
- **补建卡要认领已存在的卡**：按流水补卡时会跳过「同会员同产品同日期」已覆盖的卡；重复导入时若流水对应的卡已存在，必须把它挂回 `owned` 索引，否则第二次导入会误判成「还没补过」而多建一张。
- **「找或建」也要查库**：`_course_for()` / `_teacher_for()` / `_room_for()` / `_synthetic_session()` 在新建前先按 `external_id` 或名称查库，避免重复导入多出一批课种 / 教练 / 教室 / 合成场次。

### 3. 命令行脚本

- `backend/scripts/import_rocketbird.py`：参数 `--dir`（必填，导出目录）、`--db`、`--dry-run`、`--no-logs`、`--report`（写出 JSON 报告路径）。启动时先设置 `DATABASE_URL` 再导入 app 模块，调用 `Base.metadata.create_all()` / `ensure_schema()` / `ensure_constraints()`（`create_all` 让脚本也能对空库直接跑），逐表打印读取 / 导入 / 跳过统计与提示信息。
- `backend/scripts/package_rocketbird_export.py`：把导出目录里的 CSV 打包成可上传的 ZIP（只打 CSV，不含 Excel 汇总表与说明文档；缺少 `members.csv` / `member_cards.csv` / `sign_logs.csv` / `finance_flow.csv` 时拒绝打包），供后台「历史数据导入」上传。

### 4. 后台接口与页面

- 新增 `backend/app/routers/admin_import.py`：
  - `POST /api/admin/import/rocketbird/upload`：multipart 上传 ZIP（≤200MB），解压前逐条校验路径拒绝目录穿越，自动定位存放 CSV 的目录层。
  - `POST /api/admin/import/rocketbird/path`：JSON `{path, dry_run?, include_logs?}`，从服务器目录导入。
  - 两个接口都用 `require_interactive_admin`（`settings.write` + 仅限登录会话，API Key 一律拒绝），正式导入后写 `audit()` 操作日志。
- `deps.required_api_key_scope()` 增加 `/api/admin/import` → `settings:write` 映射，保证 API Key 命中时给出明确的范围提示而不是「不支持此接口」。
- 前端新增 `src/pages/admin/settings/LegacyImportPanel.tsx`，在 `SettingsPage` 增加「历史数据导入」标签页：演练 / 操作日志两个勾选项、ZIP 上传、逐表统计表格与提示信息；`src/lib/adminTranslations.ts` 补齐中英文案。

### 5. 营收口径与验证

- 营收按本系统口径重算：团课购卡全额确认、365 天年卡与组合套餐按天均摊、私教与评估只在消课时确认。
- 导入后核对：现金实收 3,414,790.14 元，确认营收 2,990,348.89 元（团课 2,060,344.80 / 私教 376,316.39 / 年卡 553,687.69），分年度现金实收 2023 年 643,358.02 元 … 2026 年 880,430.00 元。
- 幂等实测：同一份导出连续导入三次，第二次与第三次 **所有表 created = 0**（会员 / 会员卡 / 体验券 / 排课 / 预约 / 流水 / 档案记录 / 操作日志全部跳过），三次导入后各表行数完全一致（会员 5,240、会员卡 1,419、体验券 1,265、排课 8,237、预约 13,494、流水 1,863、档案记录 4,795）。HTTP 接口侧同样验证：演练 → 正式导入 → 再正式导入，第二次全部跳过。
- `npm run build` 通过；HTTP 接口实测全量导入（含 2.2 万条操作日志）约 18 秒，演练模式完整回滚（导入后数据库计数与演练前一致），解压出来的临时目录在导入结束（含出错）后自动清理。

### 6. 文档

- `docs/API.md` 新增 13.12 / 13.13 两节（接口总数 137 → 148），`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（18 章 / 148 个接口）。
- `public/help.html` 「数据导入、备份与恢复」新增第 4 节「导入勤鸟（RocketBird）历史数据」，含准备压缩包、先演练后正式导入、营收口径与幂等说明。
- `public/changelog-details.html` 追加 BATCH 19（含三张后台界面截图，其中第三张展示「重复导入时各表导入数为 0」）、`docs/CHANGELOG_CLIENT.md` / `docs/CHANGELOG_DEVELOPER.md` / `src/lib/changelog.ts` 同步；`API_ENDPOINT_COUNT` 同步为 148。

### 7. 数据安全

- 勤鸟导出目录 `historicalData/` 含会员姓名、手机号、身份证号等个人信息，仓库是公开的，因此连同本地临时目录 `.tmp/` 一起写进 `.gitignore`，不入库；数据通过后台「历史数据导入」上传 ZIP 或服务器目录导入线上库。

## 三十三、中英文名称分家与原始数据适配（2026-11-26）

### 1. 名称拆分器 `backend/app/name_normalizer.py`

- `split_bilingual(text) -> (chinese_name, english_name)`：把勤鸟导出里中英文写在一起的名称拆到两个字段。
- `MIN_LATIN_LENGTH = 4`：短拉丁串（FIT / Pro / DMT / mbti）判定为中文名的一部分，原样留在中文侧；「呼吸Pro®️伸展复原」「国庆疗愈季 活力zumba舞蹈」因此不被误拆。
- 混合 token 处理：拉丁串必须延伸到 token 结尾或开头才判定为英文侧，避免把「垫上普拉提-Arc练习」这类中缀英文切碎。
- 纯标点 token 跟随相邻语种归属；括号做 `_balance_brackets()` 配平。

### 2. 导入器改造 `backend/app/legacy_import.py`

- 新增 `_explicit_names(row, prefix, raw)`：优先读适配包里的「课程中文名 / 课程英文名」等显式列，缺列时回退 `split_bilingual(raw)`。
- 新增 `_apply_bilingual(entity, display, english)`：把已存库的混排名称改写为 `name` / `name_en`，仅在 `name_en` 为空时补写英文。
- 新增 `_normalize_catalogue()`：`run()` 的第一步，遍历 Course / Room / Teacher / CardProduct，把混排名称统一拆分；**目标中文名已被别的行占用时跳过**，避免与既有资料撞车；卡产品额外先过 `PRODUCT_ALIASES` 归一。
- `_import_rooms` / `_import_teachers` / `_import_courses` 改用显式列；匹配键同时登记原始名与拆分后的名字（`rooms_by_key` 等），排期与签到仍以原文匹配，两种写法都能命中。
- `_course_for` / `_teacher_for` / `_room_for` 重写：新建时存拆好的 `name` + `name_en`；命中已存在的行且其名称仍是混排时顺手改写。
- `_private_room()` 用 `split_bilingual("私教室 Private Studio")`，查找时同时匹配拆分名与旧混排名。
- `_product_specs` 增加 `name_zh` / `name_en`，`card_products.csv` / `member_cards.csv` / `contract_orders.csv` 统一走同一套命名。

### 3. 适配脚本 `backend/scripts/adapt_rocketbird_export.py`

- `--dir <源目录> --out <输出目录> --zip`：复制全部 CSV / xlsx / md，并给目录类表追加中英文分列。
- `CATALOGUE_COLUMNS` 覆盖 `class_types.csv`（课程名称 / 课程中文名 / 课程英文名）、`classrooms.csv`（教室…）、`staff_coaches.csv`（教练…）、`card_products.csv` / `member_cards.csv` / `contract_orders.csv`（卡…）；卡类三表额外过 `PRODUCT_ALIASES`。
- 生成 `适配说明.md`（适配内容、导入步骤、表清单与隐私提醒），并打包 `rocketbird_export_adapted.zip`。
- **原始导出不改写**：排期与签到表引用的是原文，改写原文会让 `SequenceMatcher` 匹配率跌破 0.6，进而生成重复的合成场次；适配包只增加分列，原文仍作匹配键。

### 4. 验证

- 适配包导入与原始包导入产出的课种 / 教室 / 教练 / 卡产品四张表**逐行字节一致**。
- 幂等复测：重复导入各表 created = 0、skipped = read，各表行数与改动前备份一致。
- 库内残留混排名复扫：课种 8 条、教室 1 条、教练 9 条、卡产品 1 条，其中英文为纯拉丁人名（`Siri Nordhem`、`Freja` 等）与中文名自带缩写（`太极FIT`）属预期保留；`私教室 Private Studio` 为旧导入遗留，已由 `_private_room()` 归一。

## 三十四、一键清除全部数据（短信清除码）（2026-11-26）

### 1. 后端 `backend/app/wipe_service.py`

- 常量：`WIPE_TARGET_PHONE = "18602113774"`、`WIPE_PHONE_MASKED = "186****3774"`、`WIPE_CODE_PURPOSE = "wipe_code"`、`WIPE_CODE_TTL_MINUTES = 10`、`WIPE_CODE_RESEND_SECONDS = 60`、`WIPE_CODE_MAX_ATTEMPTS = 5`、`WIPE_CONFIRM_TEXT = "清除全部数据"`、`WIPE_ADMIN_PASSWORD = "Tpc@2026"`。
- `PRESERVED_TABLES = ("app_settings", "sms_settings", "backup_plan_settings", "api_keys")`：场馆名称 / Logo / 备份计划 / 短信运营商 / API 密钥等与商业无关的数据原样保留。
- `request_wipe_code(db, actor)`：60 秒内重复请求直接拒绝；随机 6 位码经 `sms_service.deliver()` 发到内置手机号（**不使用 `send_otp`**，避免开发模式下 `dev_code` 随接口返回）；短信通道未启用或服务商账号未配置时返回 502「清除码发送失败，请先在「短信通知」里启用短信通道并配置服务商账号」；挑战以 `hash_otp(code)` 存 `SmsOtpCode`，此前未用的同类挑战作废；**返回值只含掩码手机号与提示语，绝不回显清除码**。
- `_verify_code(db, code)`：最多 5 次尝试，单次有效。
- `_delete_tables(keep_user_id)`：SQLite 的 `PRAGMA foreign_keys` 在事务内是空操作，因此整库清空必须走**裸 DBAPI 连接**并 `PRAGMA foreign_keys=OFF`；遍历 `sqlite_master` 删除所有表数据（跳过 `PRESERVED_TABLES` 与 `sqlite_%`），`users` 表保留当前管理员，其余删除；非保留表的 `sqlite_sequence` 一并复位。
- `_clear_uploads()`：清空 `backend/uploads`（会员照片等附件）。
- `wipe_data(db, actor, *, code, confirm)`：校验确认口令 → 校验清除码 → 提交 → 清表 → `expire_all()` → 重置管理员密码为 `Tpc@2026` 并启用账号 → 置 `settings.demo_data_disabled = True` → 清附件 → 写 `audit(db, actor, "maintenance", "wipe_data", "database", …)`（这是清除后仅存的痕迹）。

### 2. 数据模型与启动行为

- `AppSettings` 新增 `demo_data_disabled: Mapped[bool]`；**新增列必须同时改 `models.py` 与 `database.py` 的 `ensure_schema()` additions 字典**（`"demo_data_disabled": "BOOLEAN DEFAULT 0"`），否则已有库不会自动获得该列。
- `seed.py`：用户与系统设置仍照常初始化，但 `demo_data_disabled` 为真时**不再写入演示数据**——否则清空后重启会重新冒出示例会员与示例课种。

### 3. 接口

- `backend/app/routers/maintenance.py` 新增 `POST /api/admin/maintenance/wipe/request-code` 与 `POST /api/admin/maintenance/wipe/execute`。
- 两个接口都用 `require_interactive_admin`（仅限登录会话，**API Key 一律拒绝**），与「改密码 / 查自身信息」同一道闸；`deps.required_api_key_scope()` 中 `/api/admin/maintenance` 映射到 `maintenance:write`，命中时给出明确范围提示。
- 请求体沿用仓库惯例：`payload: dict = Body(...)` + 自由字典取值；`detail` 全部中文。

### 4. 前端

- 新增 `src/pages/admin/settings/WipeSettings.tsx`：`useAuth()` 取 `logout()`，清除成功后强制退出登录（清除后原令牌对应的会话已不再有效）。
- `SettingsPage.tsx` 标签页新增「数据清除」（位于「历史数据导入」与「回收站」之间）。
- `src/styles.css` 新增 `.wipe-notes` 与 `.wipe-actions`；危险按钮复用既有 `.button-danger-ghost`（仓库无 `.button-danger`）。
- `src/lib/adminTranslations.ts` / `adminMessages.ts` 补齐中英文案。

### 5. 验证

- 服务级与 HTTP 级各跑通一次全量清除：仅剩 admin 账号且密码为 `Tpc@2026`；`app_settings` / `sms_settings` / `backup_plan_settings` 完整保留；全部业务表清空；`uploads` 清空；`demo_data_disabled = 1`；操作日志只剩一条 `wipe_data`。
- 短信通道用本地假网关（`http.server`）验证：`request-code` 响应体不含 `code` 字段，清除码只出现在短信内容里；错误码返回「清除码错误或已过期」。
- `npm run build` 通过。

### 6. 文档

- `docs/API.md` 新增 13.14 节「一键清除全部数据（短信清除码）」，接口总数 149 → 151；`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（18 章 / 151 个接口）。
- `public/help.html`「数据导入、备份与恢复」新增第 5 节「中英文名称分家」与第 6 节「一键清除全部数据（短信清除码）」。
- `public/changelog-details.html` 追加 BATCH 21 / 22（3 张界面截图）、`docs/CHANGELOG_CLIENT.md` / `docs/CHANGELOG_DEVELOPER.md` / `src/lib/changelog.ts` 同步；`API_ENDPOINT_COUNT` 同步为 151。
- `historicalData/`（含会员姓名、手机号、身份证号）与适配包产物均不入库，`.gitignore` 已覆盖。

---

## 三十五、MODIFY1128 需求批次：签到不关窗、健康评估消课与列表检索排序（2026-11-28）

### 1. 团课签到留在弹窗内（`src/pages/admin/BookingsPage.tsx`）

- `action()` 不再在成功后调用 `setSelected(null)`；`load()` 之后 `setSelected((current) => current ? sessionResult.items.find(...) ?? null : null)` 会把弹窗重新选中，因此「签到消课 / 取消签到 / 取消 / 爽约」都留在名单弹窗内完成。
- 弹窗内新增 `rosterMessage` / `rosterError` 两个状态，渲染在 `.roster-feedback` 容器里（`Notice` 组件），成功与失败都给出中文提示；`.roster-feedback:empty` 时不占位。

### 2. 权益匹配由「单一课种」改为「类别集合」（`backend/app/booking_service.py`）

- 新增 `session_categories(course)` 与 `product_categories(product)`：根据课程 / 卡产品的类别与名称归出一组可用类别；`looks_like_assessment()` 依据「健康评估」「体测」「assessment」判定评估课，团课名健康评估优先用评估卡。
- `find_available_card()` / `has_available_entitlement()` 按类别集合匹配，`_card_quantity_for()` 相应放宽。
- 空有效期起止日期的卡不再按「已过期」处理（`_card_reject_reason`）。
- 消课失败时的报错由固定文案改为 `_no_entitlement_hint()`：在「会员无可用卡、体验券或对应权益不足，请先购卡/续卡」后追加会员现有卡与被拒原因（最多 4 条）。
- **新增列** `bookings.consumed_type`（`String(24)`，默认 `""`）：记录本次消课用的是 `card` / `benefit:<类别>` / `voucher`，`restore_consumption()` 据此原样退回，避免退错权益。`models.py` 与 `database.py` 的 `ensure_schema()` additions 两处都已补齐。

### 3. 教练与卡课产品自定义排序

- **新增列** `teachers.sort_order`、`card_products.sort_order`（`models.py` + `ensure_schema()` 的 additions 两处同步）。
- 新增接口 `POST /api/admin/teachers/reorder`（`catalog:write`）与 `POST /api/admin/products/reorder`（`finance:write`）：请求体提交**完整**的 id 顺序列表，缺项返回「请提交完整的教练排序 / 产品排序」；沿用既有 `/api/admin/rooms/reorder` 的模式。
- `admin_core.py` 的 `meta` 接口：`teachers` 按 `(sort_order, id)` 排序；`products` 按 `(PRODUCT_GROUP_ORDER[category], sort_order, id)` 排序（`finance_service.PRODUCT_GROUP_ORDER` 定义 group 0 / private 1 / assessment 1 / annual 2 / package 2 / workshop 3 …）。
- `public.py` 的 bootstrap 引导者列表同步按 `(sort_order, id)` 排序。

### 4. 前端检索与排序

- 新增 `src/components/SortableTable.tsx`（`useTableSort` + `SortableTh`）、`src/components/SearchableTeacherSelect.tsx`、`src/components/SearchableProductSelect.tsx`。
- `SessionEditor.tsx` 的「教练」字段换成可检索选择器；`BookingsPage.tsx`（课表）、`ProductsPage.tsx`、`CoursesPage.tsx`、`NoticesPage.tsx`、`FinancePage.tsx`、后台教练列表（`settings/CatalogSettings.tsx`）均接入关键词检索与表头排序；`MemberProfileDrawer.tsx` 的购卡弹窗换成可检索分组的产品选择器。

### 5. 界面细节

- `RoomsPage.tsx`：教室列头改为中英文上下两行（`.room-column > header .room-name-en`），窄屏紧凑列表同样上下两行（`.room-compact-names`）；使用类别下拉移除「Outlook 会议」选项（ICS 导入路径与 `usage_type="outlook"` 样式保留，导入的历史日程仍需该标签）。
- `MemberProfileDrawer.tsx`：「团课预约记录 / 私教预约记录 / 消费记录」统一使用 `.member-resource-section` 白底卡片，与「体测 / Assessment」一致。

### 6. 文档与验证

- `docs/API.md`：Teacher / CardProduct 结构体补 `sort_order`，Booking 补 `consumed_type`；新增 §8.31 教练自定义排序、§9.16 卡课产品自定义排序；§8.7 补充评估课的类别匹配说明与新的 400 报错；接口总数 151 → 153。`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（18 章 / 153 个接口）。
- `public/help.html` 同步：「签到后名单不会关闭」「健康评估也能消课」、排课步骤 2 的可检索教练字段、「教练可以自己排序」「教室名中英文上下两行显示」「使用类别不再有 Outlook 会议」「产品顺序可以自己定」与购卡弹窗的可检索分组产品选择器。
- `public/changelog-details.html` 追加 BATCH 23（8 张界面截图，图 89–96）；`docs/CHANGELOG_CLIENT.md`、`docs/CHANGELOG_DEVELOPER.md`、`src/lib/changelog.ts`（`API_ENDPOINT_COUNT` 151 → 153、`APP_RELEASE_DATE` → 2026-11-28）同步。
- 验证：`npm run build`（`tsc -b` + vite）通过；`.shot/test_entitlement.py` 验证评估课消课与撤销签到退卡（`consumed_type: card` → 撤销后 `consumed: False`）；`/api/admin/teachers/reorder` 与 `/api/admin/products/reorder` 实测返回 `{"ok": true}`。

## 三十六、部署端反馈修复批次：员工手机号占用与前端构建依赖（2026-11-28）

来源：`wellnessbooking-fixes-20261128.zip`（部署环境打包的两个 fix，基于上游提交 `f9b68d5`），本节记录整合后的落地方式与取舍。

### 1. 员工手机号占用统一处理（新增 `backend/app/phone_service.py`）

- **根因**：`User.phone` 上有数据库级唯一约束（`models.py`：`mapped_column(String(32), unique=True)`），而唯一约束**包含回收站（软删）行**；`create_user` / `update_user` / `update_me` 三处的重复校验只查 `deleted_at IS NULL`，校验放行但数据库拒绝 → `IntegrityError` → 500。
- **处理规则**（与产品确认一致）：
  - 与**在职账号**冲突 → `400 该手机号已被 {full_name or username}（{username}）绑定`；
  - 与**回收站账号**冲突 → 自动清空对方 `phone` 完成号码转移，操作继续，不报错；
  - `phone` 为空串 → 直接放行（清空号码）；格式错误仍由 `utils.valid_phone()` 抛 `400 手机号格式不正确`。
- **实现要点**：释放占用方必须**立即执行 SQL 并 `db.flush()`**——同表多行 UPDATE 的 ORM 提交顺序不保证，若先写占用方再释放方，唯一约束会在语句级立刻失败（第一版实现即栽在这里）。
- 接入点：`backend/app/routers/admin_settings.py`（`create_user` / `update_user`）与 `backend/app/routers/auth.py`（`update_me`，员工自助改绑）。三处原有「该手机号已被其他员工账号使用」的校验与提示统一替换为 `claim_phone()`。

### 2. 前端提示可见性（`src/pages/admin/settings/UsersSettings.tsx`）

- 原实现里保存失败时 `error` 只渲染在设置区块里，弹窗打开时被遮罩挡住，用户必须关掉弹窗才知道没保存成功。改为在 `Modal` 内也渲染 `{error && <Notice error message={error}/>}`，并在 `openCreate()` / `openEdit()` 时清空 `error` / `message`，避免上一次加载错误残留。
- `src/lib/adminMessages.ts` 的 `translateAdminMessage()` 新增动态文案规则 `/^该手机号已被 (.+)（(.+)）绑定$/` → `This mobile number is already bound to {name} ({username}).`，英文后台不再显示中文。

### 3. 构建依赖补齐（`package.json` / `package-lock.json`）

- **根因**：`src/components/QrCode.tsx` 动态 `import("qrcode")`，但仓库既没有 `@types/qrcode`，也没有本地声明文件；本机 `node_modules/@types/qrcode` 是 extraneous（未写进 `package.json`），干净环境 `npm install` 后 `tsc -b` 报 `TS7016: Could not find a declaration file for module 'qrcode'`。
- **处理**：与上游 fix 的「加本地 `src/qrcode.d.ts`」不同，这里选择把 `@types/qrcode@^1.5.6` 正式写进 `devDependencies` 并更新 `package-lock.json`（`lockfileVersion` 3，新增 `@types/qrcode` / `@types/node` / `undici-types` 三个 dev 包），让 `npm ci` 之后类型一定存在；类型来自官方包而不是手写声明，后续用到其他 API 也不会缺类型。
- 代价：本地 `node_modules/@types/qrcode` 由 extraneous 变为正式依赖，`package.json` / `package-lock.json` 有小幅改动。

### 4. 文档与验证

- `docs/API.md`：§3.8（`PATCH /api/auth/me`）、§10.6（`POST /api/admin/users`）、§10.7（`PATCH /api/admin/users/{user_id}`）补充手机号冲突规则；`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（18 章 / 153 个接口，接口总数不变）。
- `public/help.html`：「账号与角色权限 → 新建、停用和重置密码」新增「手机号撞号怎么办」条目，说明在职冲突与回收站自动转移两种情况。
- `public/changelog-details.html` 追加 BATCH 24（1 张界面截图，图 97）；`docs/CHANGELOG_CLIENT.md`（97 张截图）、`docs/CHANGELOG_DEVELOPER.md`、`src/lib/changelog.ts` 同步。
- 验证：`npm ci` + `npm run build` 通过（此前无 `@types/qrcode` 时 `tsc -b --force` 稳定复现 TS7016）；`.shot/test_phone_fix.py` 实测：回收站冲突 → 200 且对方 `phone` 置空，在职冲突 → 400「该手机号已被 系统管理员（admin）绑定」，格式错误 → 400「手机号格式不正确」，`PATCH` 走同一套规则；测试产生的临时账号已从本地库清理。

## 三十七、MODIFY1129 需求批次：会员卡状态口径、权限矩阵可编辑与排课批量操作（2026-11-28）

来源：`modify1129.pdf`（最终编辑列表，12 条）。R1–R10 为代码改动，R11、R12 为评估与排查。

### 1. 会员卡状态口径统一（新增 `backend/app/card_state.py`）

- 原来「卡状态」在列表、档案、筛选、导出各处各写一套判断，措辞也不一致（「有有效卡 / 未开卡 / 开卡日期待定」）。新增 `backend/app/card_state.py` 作为**单一事实来源**：
  - `card_display_status(card)` 返回 7 种显示状态：`active` 正常 / `pending` 未激活 / `expired` 已过期 / `used_up` 已用完 / `void` 已销卡 / `upgraded` 已升卡 / `frozen` 已冻结；勤鸟历史数据的 `status="used"` 归入「已用完」；
  - `card_status_condition(status)` 返回对应的 SQLAlchemy `ColumnElement`，把筛选**下推到数据库**而不是在 Python 里遍历卡片。
- `serializers.card_dict()` 新增 `display_status` 字段（`src/types.ts` 的 `MemberCard` 同步），前端 `src/lib/cardCopy.ts` 提供同名判断作为兜底，两端口径一致。
- 配色口径：正常＝绿、未激活＝黄、已过期与已用完＝红、无会员卡＝灰。

### 2. 会员名单筛选下推到 SQL（性能）

- `GET /api/admin/members` 原先 `query.all()` 读出**全表 ORM 对象**再用 Python 过滤与排序（`member_card_sort_key` 等），会员上千时明显变慢。改为：
  - 用 `select(Member.id).where(...)` 子查询承载搜索、卡种、持卡状态三类条件，`or_(*clauses)` 实现多选状态的**或**语义；
  - `total` 用 `func.count().select_from(subquery)` 统计，`_card_stats()` 用 `func.count(func.distinct(MemberCard.member_id))` + `GROUP BY` 统计卡种人数；
  - `_member_id_order()` 只查 `Member.id` 等轻量字段完成排序，再按 ID 窗口回表取当页数据。
- `card_status` 参数由单值改为**逗号分隔的多值**（`active,expired`），前端 `MembersPage.tsx` 的筛选项从 `<select>` 换成复选 `Dropdown`，选项文案统一为「有效卡 / 未激活 / 已过期 / 已用完 / 无会员卡」。
- 实测：单次列表查询由约 0.222 s 降到 0.09～0.15 s（对应 R12 的排查结论）。

### 3. 会员档案的卡分组与筛选（`MemberProfileDrawer.tsx`）

- `cardRows` useMemo：把本人卡与共享卡合并后按 `CARD_CATEGORY_GROUPS`（团课 / 私教 / 体测评估 / 年卡·组合套餐 / 工作坊 / 其他）分组渲染，每组先出标题与张数，组内按 有效 → 未激活 → 其余 排序（有效卡排最前）。
- 新增「全部卡 / 有效卡 / 失效卡」三个筛选按钮（`cardFilter`），「有效」口径为 `active` 与 `pending`。
- **移除卡外侧的 `RecycleDeleteButton`**（R7）：作废一张卡统一走卡操作里的「销卡」，避免两个删除入口。
- 卡状态徽章改用 `cardStatusTone()` / `cardStatusLabel()`，与名单配色一致；`start_pending` 文案由「开卡日期待定」改为「未激活（首次签到自动开卡）」。
- 备注区：`.profile-note` 字号加大 2 号（14px / 行高 1.7），`.profile-note span` 设 `max-height: 168px` + `overflow-y: auto`，超出内部滚动而不撑开页面（R8）。

### 4. 名单翻页跳页（`MembersPage.tsx`）

- 翻页条新增「首页」「末页」按钮与 `page-jump` 页码输入框（`onBlur` / `Enter` 触发跳转，越界时回填当前页），样式见 `.member-pagination .page-jump`。

### 5. 权限矩阵改为可编辑（新增 `role_permissions` 表）

- `models.py` 新增 `RolePermission(role, capability, allowed)`（`Base.metadata.create_all` 自动建表）；`permissions.py` 增加 `_ROLE_OVERRIDES` 内存缓存、`refresh_overrides()` / `load_overrides()` / `effective_capabilities()`，`has_capability()` 与 `role_capabilities()` 改为读**默认矩阵 + 覆盖**。
- 覆盖表在 `main.py` 的 lifespan 里启动载入，保存后由 `admin_settings.update_role_permissions` 立即 `load_overrides(db)` 刷新，接口校验、菜单可见性与前端按钮口径一致。
- 新增 `PUT /api/admin/role-permissions`（`require_settings_write`）：整体覆盖保存，**忽略 `admin` 角色**（避免把管理员锁在系统外），未知能力返回 400「存在未知的能力：…」，保存后写 `audit`。
- `GET /api/admin/role-permissions` 增加 `matrix` 与 `editable` 字段；前端 `UsersSettings.tsx` 渲染 `.permission-matrix` 勾选表格并调用保存接口。
- 默认矩阵调整：`frontdesk` 增补 `catalog.write`（R9 开放「教练管理 / 教室管理 / 课程库」的维护权限），`backend/app/permissions.py` 与 `src/lib/permissions.ts` 同步，并更新 `docs/API.md` §1.4。

### 6. 排课批量删除与按日期复制（`admin_schedule.py` / `SchedulePage.tsx`）

- 新增 `POST /api/admin/sessions/batch`（`require_bookings_write`）：`action=cancel` 取消课程（走 `transition_booking` 取消关联预约并触发 `notify_booking`），`action=recycle` 移入回收站（**有预约的课程拒绝回收**，逐条写入 `skipped`）；空 ID 返回 400「请先选择要处理的排课」。
- 新增 `POST /api/admin/sessions/copy-dates`：支持 `source_date`/`target_date` 单组或 `source_dates`/`target_dates` 多组一一对应，`course_type` 可限定课种；复制时按「课程 + 教练 + 教室 + 日期 + 开始时间」判重，来源与目标同日期跳过并提示「来源与目标日期相同」，`_validate_session` 冲突逐条说明。
- 前端 `SchedulePage.tsx` 增加复选框与 `.schedule-bulk` 批量操作条（含批量删除与按日期复制两个入口）；样式见 `.schedule-bulk` / `.schedule-class-wrap`。

### 7. 文档与验证

- `docs/API.md`：新增 §8.6 批量处理排课、§8.7 按日期复制课表；§10.9 增加 `PUT /api/admin/role-permissions`；§2.4 增加 `display_status` 字段；§6.1 说明 `card_status` 多选语义；§1.4 能力矩阵补 `catalog.write`。`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（18 章 / **156** 个接口，较上批 153 个新增 3 个）。
- `public/help.html` 同步：排课章节新增「批量处理与按日期复制课表」，会员章节新增「按持卡状态筛选会员」与「会员卡状态与分组」，权限章节新增「自定义权限矩阵」，翻页说明补充首页 / 末页 / 页码跳转。
- `public/changelog-details.html` 追加 BATCH 25（7 张界面截图，图 98–104）；`docs/CHANGELOG_CLIENT.md`、`docs/CHANGELOG_DEVELOPER.md`、`src/lib/changelog.ts`（`API_ENDPOINT_COUNT` 153 → 156）同步。
- 验证：`npm run build`（`tsc -b` + vite）通过；后端实测 `POST /api/admin/sessions/batch` 空 ID → 400「请先选择要处理的排课」，`POST /api/admin/sessions/copy-dates` 同日期 → 「来源与目标日期相同」，`GET/PUT /api/admin/role-permissions` 往返一致且前台已含 `catalog.write`。

### 8. R11 Outlook 会议室预定导入（评估结论：可实现）

系统已有 `POST /api/admin/room-reservations/import-ics`（后台 → 教室管理 → 导入 Outlook 日历），按 .ics 的 `LOCATION` 与系统教室名匹配，命中后生成 `usage_type="outlook"` 的教室预定，并以 `external_uid` 幂等去重。**2027 年底之前的会议室预定只要能导出 .ics 即可批量导入**；限制是教室名必须与系统完全一致，不匹配的记录会被跳过（可先在 .ics 里改成与系统一致）。

### 9. R12 公司网络加载慢（代码层排查结论）

- 服务端不是瓶颈：已把会员列表等接口从「整表 ORM 读出 + Python 过滤」改为 SQL 层过滤，实测单次 0.222 s → 0.09～0.15 s；不再有整表实例化开销。
- 剩余等待来自**静态资源的带宽与代理链路**：前端产物含约 742 KB + 375 KB 的 JS 与 733 KB 的 CSS，公司网络带宽受限或需走代理时首屏等待明显。建议站点域名绕过代理、开启 gzip 与静态资源缓存；骨架屏属于可选的前端体验优化，本批未做。

## 三十八、会员档案性能优化：上课记录分页加载与接口瘦身（2026-11-28）

起因：会员反馈「会员卡信息超长时打开会员档案很慢」。实测发现瓶颈**不在卡**（40 张卡只有 22 KB），而在上课记录。

### 1. 根因定位（.shot/profile_member2.py 采样会员 5238 韩露）

- 该会员有 **1461 条 bookings**，档案接口返回体积 **6.97 MB**：
  - `booking_dict` 内嵌 `member_dict(row.member)`（含 857 字备注）→ 每条重复一遍，合计 **3.65 MB**；
  - 内嵌 `session_dict(row.session)`（含课程简介 1.30 MB + 教练简介 0.56 MB）→ 合计 **2.47 MB**；
  - 40 张卡合计仅 22 KB。
- 服务端 **1572 条 SQL**（每条 booking 惰性加载 member / member_card / session / course / teacher / room），首次调用 378 ms。
- 结论：与用户直觉一致的方向是「分页 / 按需加载」，但根因是**载荷重复**，必须同时做服务端瘦身与前端分页。

### 2. 服务端改动

- `backend/app/serializers.py`：
  - 新增 `card_summary_dict()`：名单用的精简卡（不含 `benefits` / `shared_with` / `note` / `card_no`）。
  - 新增 `profile_booking_dict()`：档案用的精简上课记录（只保留 `session_date`、`start_time`、`course_name`、`course_type`、`teacher_name`、`card_name`、`status`、`booked_at` 等表格字段，不再内嵌会员与课程资料）。
  - `member_dict()` 增加 `cards_summary` 参数：名单走摘要、档案走完整卡。
- `backend/app/routers/admin_core.py`：
  - `GET /api/admin/members` 改用 `cards_summary=True`。
  - `GET /api/admin/members/{member_id}`：移除全量 `bookings` 查询，改为 `joinedload` 预取 `Member.cards → MemberCard.product / shares → MemberCardShare.member` 与 `MemberRecord.teacher`，并返回 `bookings_total`；`bookings` 恒为空数组（保持字段存在，兼容旧客户端）。
  - 新增 `GET /api/admin/members/{member_id}/bookings`：`page`（默认 1）、`page_size`（默认 20，上限 100）、`course_type`（逗号分隔多选）；`joinedload(Booking.session → course/teacher)` 与 `joinedload(Booking.member_card → product)` 消除 N+1；返回 `{ items, total, page, pages, page_size }`。
- 结果：档案接口 **1572 → 8 条 SQL、378 → 35 ms、6.97 MB → 117 KB**；名单接口 **324 → 5 条 SQL、114 → 41 ms、214 → 143 KB**；上课记录分页接口 2 条 SQL / 8 KB 每页。

### 3. 前端改动

- `src/types.ts`：新增 `ProfileBooking`；`MemberDetail.bookings` 改为可选并新增 `bookings_total`。
- `src/components/MemberProfileDrawer.tsx`：上课记录改为**标签页懒加载 + 分页**——
  - `bookingType` 由当前 `tab` 推导（`group` / `private,assessment,workshop`），`useEffect` 依赖 `[detail.id, bookingType, language]`（**不能用 `local`**，它在 `LanguageContext` 里每次渲染都是新函数，会造成无限请求循环）；
  - `loadMoreBookings()` 追加下一页，表格底部渲染 `.profile-records-footer`（计数 + 「加载更多」按钮）；
  - `bookingTable()` 改用精简字段渲染。
- `src/styles.css`：新增 `.profile-records-footer`。

### 4. 文档与验证

- `docs/API.md`：6.3 补充「上课记录不再随档案一次性返回」与 `bookings_total`，新增 `#### GET /api/admin/members/{member_id}/bookings`；6.1 说明名单里的 `cards` 为摘要。`python docs/build_api_docs.py` 重新生成 `public/api-docs.html`（18 章 / **157** 个接口）。
- `public/help.html`：会员章节新增「5. 上课记录分页加载」，原 5、6 节顺延为 6、7。
- `public/changelog-details.html` 追加 BATCH 26（2 张界面截图，图 105–106）；`docs/CHANGELOG_CLIENT.md`、`docs/CHANGELOG_DEVELOPER.md`、`src/lib/changelog.ts`（`API_ENDPOINT_COUNT` 156 → 157）同步。
- 验证：`npm run build` 通过；HTTP 实测档案接口 72 ms / 117 KB、分页接口 46 ms / 7.8 KB（total 1403、pages 71，第 1、2 页无重叠）；截图确认「团课预约记录 20 / 1403 条」「私教预约记录 20 / 58 条」与「加载更多」按钮工作正常。

### 5. 会员端 `GET /api/public/me` 同步瘦身

会员端「我的预约」用的是同一个 `/api/public/me`，根因与后台档案一致（`booking_dict` 内嵌会员资料与课程简介 + N+1 惰性加载）。

- `backend/app/serializers.py`：新增 `member_booking_dict()` —— 会员端专用的**扁平**精简记录，只含 `id` / `session_id` / `status` / `card_name` / `booked_at` / `cancelled_at` / `checked_in_at` / `consumed`，以及摊平的 `session_date` / `start_time` / `end_time` / `course_type` / `course_name` / `teacher_name` / `room_name`（含 `_en`）。摊平是为了避免嵌套对象把 JSON 键名重复上千遍。
- `backend/app/routers/public.py`：`member_me()` 改用 `joinedload(Booking.session → course/teacher/room)`、`joinedload(Booking.member_card → product)`；会员卡改用 `own_cards` 显式查询 + `selectinload(MemberCard.shares)`，避免 `card_dict` 逐卡惰性加载。
- `src/types.ts`：新增 `MemberBooking`，`MemberMe.bookings` 改为 `MemberBooking[]`。
- `src/pages/PublicHome.tsx`：`bookingLimit` 状态（默认 30），「我的预约」标签页用 `me.bookings.slice(0, bookingLimit)` 渲染，底部 `.me-list-more` 提供「查看更多（还有 N 条）」按钮（每次 +30），`loadMe()` 后重置为 30。
- `src/styles.css`：新增 `.me-list-more`。
- 实测：同一会员 1461 条记录，接口体积 **6.53 MB → 704 KB**，SQL **1526 → 1 条**，HTTP 端到端 317 ms → 145 ms；页面首屏只渲染 30 条（原来 1461 条 DOM 节点）。
- `docs/API.md` 4.5 补充 `bookings` 为精简记录及字段清单；`public/api-docs.html` 重新生成（仍为 157 个接口）。

### 6. 会员档案抽屉加宽

- `src/styles.css`：`.modal-drawer` 的 `width` 由 `min(1440px, calc(100% - 48px))` 改为 `min(1720px, calc(100% - 48px))`，最大宽度 +280 px。
- `.modal-drawer` 目前只用于会员档案抽屉（`Modal drawer` 仅 `MemberProfileDrawer` 传入），因此不影响其它弹窗；`.modal` / `.modal-wide` 的宽度规则保持不变。
- 内部布局（`.member-profile-layout` 两栏、`.profile-facts`、`.profile-cards > article` 等）全部使用 `minmax()` / `1fr` 弹性列，无需改动即可自适应更宽的内容区。
- 移动端断点 `@media` 内 `.modal-drawer { width: 100% }` 不变。
- 实测 1920 像素视口：抽屉宽 1720 像素、内容区 1718 像素（此前 1440 / 1438）。

### 7. 会员档案左侧清单搜索框吸顶

- `src/components/MemberProfileDrawer.tsx`：搜索框包进新的 `.member-switcher-search-bar` 容器；姓名列表容器加 `.member-switcher-list` 类名。
- `src/styles.css`：
  - 新增 `.member-switcher-search-bar { position: sticky; top: 0; z-index: 3; padding: 17px 0 0; background: #f4f6f1; }`，与侧栏同色，列表内容从其下方滚过。
  - `.member-switcher` 的 `padding` 由 `17px 10px` 改为 `0 10px 17px`（顶部留白改由吸顶条承担，滚动后位置不跳动）。
  - 原 `.member-switcher > div`（列表容器）选择器改为 `.member-switcher > .member-switcher-list`，避免误伤新的搜索条外层；移动端隐藏列表的规则同步改名。
  - 输入框样式选择器由 `.member-switcher > .member-switcher-search` 改为 `.member-switcher-search-bar .member-switcher-search`。
  - 移动端（≤960px）侧栏本身不滚动，搜索条恢复 `position: static`，布局与以前一致。
- 实测：1600×900 视口下侧栏 `scrollHeight/clientHeight = 2033/835`，滚到底（`scrollTop = 1198`）后输入框 `getBoundingClientRect().top` 仍为 83（吸顶前同为 83），完全可见。

### 8. 客户档案整包导出（多 Sheet Excel）

- 新增 `backend/app/member_export_service.py`：`build_member_profile_workbook(db, member)` 生成 11 张 Sheet 的工作簿并返回 xlsx 字节流。
  - Sheet：基本信息 / 会员卡 / 团课预约记录 / 私教预约记录 / 其它预约记录 / 私教跟进记录 / 体测评估 / 消费记录 / 体验券 / 提醒 / 合同与资料。
  - 预约记录按 `ClassSession.course.course_type` 分桶：团课为 `group`，私教桶为 `private` / `assessment` / `workshop`，其余归入「其它预约记录」，保证一条不丢。
  - 会员卡含本人卡与通过 `member_card_shares` 共享进来的卡，标出「本人 / 共享卡（某某）」归属与共享给名单。
  - 「基本信息」页汇总持卡数、有效卡数、上课总数、已消课 / 取消 / 爽约次数、团课与私教次数、累计消费金额等。
- `backend/app/export_service.py`：拆出 `sheets_to_workbook(sheets)` 返回 `Workbook` 对象（`build_sheets_workbook` 改为在其之上保存成字节流），供导出后继续加工（如嵌入照片）。
- `backend/app/member_export_service.py::_embed_photo()`：把本地照片（`upload_path(member.photo_url, "members")`）嵌到「基本信息」页 D1，尺寸 96×96；远程 URL 或无照片时跳过，单张异常不中断整份导出。
- `backend/app/routers/admin_exports.py`：新增 `GET /api/admin/members/{member_id}/export.xlsx`，能力门 `require_members_view`（API Key 走 `read` 范围，无需改 `required_api_key_scope`），会员不存在或已软删除返回 404「会员不存在」。
  - 查询全部使用 `joinedload` / `selectinload` 预加载课程、教练、教室、卡产品与共享关系，避免导出时 N+1。
- `src/components/MemberProfileDrawer.tsx`：档案操作行新增「导出档案」按钮（`can("members.view")` 可见），调用 `downloadFile("/api/admin/members/{id}/export.xlsx", "{姓名}-客户档案.xlsx")`，导出期间按钮显示「导出中…」并禁用；失败时用 `Notice` 提示「导出失败，请稍后重试」。
- `docs/API.md` 新增 13.12「导出客户档案 Excel（一张 Excel、多张 Sheet）」，后续小节编号顺延；`public/api-docs.html` 重新生成（157 → 158 个接口）；`src/lib/changelog.ts` 的 `API_ENDPOINT_COUNT` 同步为 158。
- `public/help.html`「打开完整档案」补充导出说明（中文与英文各一处）。
- 实测：会员 5238（1461 条上课记录、40 张卡）导出 140,708 字节、11 张 Sheet，团课 1403 行、私教 58 行、私教跟进 103 行、消费 38 行；接口 HTTP 200，`Content-Disposition: attachment; filename="wellness-member-5238-2026-11-28.xlsx"`；无 token 返回 401、会员不存在返回 404。

### 9. 会员资料新增「邮件地址」字段

- 数据层：`backend/app/models.py` 的 `Member` 新增 `email: Mapped[str] = mapped_column(String(160), default="")`；`backend/app/database.py::ensure_schema()` 的 `additions["members"]` 同步补 `"email": "VARCHAR(160) DEFAULT ''"`，已有库启动时自动加列。
- 接口层：
  - `backend/app/routers/admin_core.py`：`MEMBER_FIELDS` 增加 `email`；新增 `EMAIL_PATTERN` 与 `_clean_email()`（去首尾空格 + 基本格式校验，不合法抛 400「邮件地址格式不正确」），新建与修改会员两处都调用。
  - `backend/app/serializers.py::member_dict()` 返回 `email` 字段。
  - `backend/app/routers/maintenance.py`：会员 CSV 导出列与导入白名单、导入模板均加入 `email`。
  - `backend/app/export_service.py`：会员名单 Excel 表头末尾增加「邮件地址」列；`backend/app/member_export_service.py`：客户档案导出「基本信息」页增加「邮件地址」项。
- 前端：
  - `src/types.ts` 的 `Member` 增加 `email: string`。
  - `src/pages/admin/MembersPage.tsx`：`MemberForm` 与 `emptyForm` 增加 `email`；编辑时回填 `detail.email`；表单里「微信号 / 紧急联系电话 / 邮件地址」包进 `<div className="form-grid three-columns span-two">`，正好落在备注上面一行；「来源说明」改为 `span-two` 独占一行，避免条件出现时右侧留空格。
  - `src/components/MemberProfileDrawer.tsx`：`.profile-facts` 末尾追加 `<span className="profile-email"><strong>{detail.email || "—"}</strong></span>`，不渲染标题。
  - `src/styles.css`：新增 `.profile-facts > span.profile-email { min-width: 0; }` 与 `.profile-facts > span.profile-email strong { min-width: 0; }`，保证长地址省略号截断。
- 实测：`PATCH /api/admin/members/5238` 传 `{"email":"hailu@example.com"}` 返回 200 且响应含该值；传 `{"email":"abc"}` 返回 400「邮件地址格式不正确」；浏览器实测编辑弹窗内三输入框与备注的纵向位置为 573–644 / 660，档案顶部末格显示邮件地址且无标题。

### 10. 会员档案操作按钮上移到顶栏

- `src/components/UI.tsx`：`Modal` 新增可选参数 `actions?: ReactNode`，渲染在 `.modal-header` 内、标题与关闭按钮之间（外层包一层 `.modal-header-actions`）；不传时不渲染，其余弹窗完全不受影响。
- `src/components/MemberProfileDrawer.tsx`：`.profile-actions` 从 `.member-profile` 的第一项改为组件内的 `actionRow` 变量，通过 `actions={actionRow}` 传给抽屉 `Modal`；按钮与权限判断原样保留。
- `src/styles.css`：
  - `.modal-header` 增加 `flex: 0 0 auto`（顶栏不再被 flex 压缩，按钮换行时正常长高）与 `gap: 14px`；`.modal-header h2` 增加 `flex: 0 0 auto` 与 `white-space: nowrap`（标题不被挤成两行；≤960px 断点恢复 `white-space: normal`）。
  - 新增 `.modal-header-actions { display: flex; flex: 1 1 auto; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; margin-left: auto; }`。
  - `.profile-actions` 去掉内容区专用的 `margin / padding-bottom / border-bottom`；新增 `.modal-header .profile-actions { display: flex; flex-wrap: wrap; }` 与 `.modal-header .profile-actions button, .modal-header .profile-upload { flex: 0 0 auto; min-height: 34px; padding: 6px 11px; font-size: 12px; }`。
  - `.modal-drawer` 改为 `display: flex; flex-direction: column`；`.modal-drawer .modal-body` 由写死的 `height: calc(100dvh - 65px)` 改为 `flex: 1 1 auto; height: auto; min-height: 0`，顶栏长高时内容区自动让位。
  - ≤700px：`.modal-header` 允许换行，`.modal-header-actions` 占满整行（`order: 3; flex: 1 0 100%`），操作按钮改为横向滚动一行（`flex-wrap: nowrap; overflow-x: auto`），顶栏高度从 197 像素降到 109 像素。
- 实测（浏览器实测）：`.profile-actions` 的父节点为 `.modal-header-actions`，内容区内不再有该行；1600×950 下顶栏高 65 像素、内容区高 883 像素、内容第一行（会员资料）起始于 89 像素（改前约 170 像素）；760 像素宽时顶栏自动长到 97 像素，420 像素宽时顶栏 109 像素且页面无横向溢出。
