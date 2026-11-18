// 系统版本与更新日志：后台“系统设置 → 更新日志”展示，按日期为分界列出主要内容。
export const APP_VERSION = "1.1.0";
export const APP_RELEASE_DATE = "2026-11-18";
export const API_VERSION = "v1.0.0";
export const API_ENDPOINT_COUNT = 128;

export interface ChangelogText { zh: string; en: string }
export interface ChangelogGroup { title: ChangelogText; points: ChangelogText[] }
export interface ChangelogRelease { date: string; version: string; title: ChangelogText; summary: ChangelogText; groups: ChangelogGroup[] }

export const changelogReleases: ChangelogRelease[] = [
  {
    date: "2026-11-18",
    version: APP_VERSION,
    title: { zh: "1117 需求全量落地：财务口径分离与运营效率", en: "All 1117 requirements delivered: separated finance bases and operational efficiency" },
    summary: { zh: "把“现金实收”与“确认营收”拆成两件事，并补齐导出与小票，是本批次的主线。", en: "Cash received and recognised revenue are now separated, with exports and receipts added to close the batch." },
    groups: [
      { title: { zh: "流水与营收分离", en: "Cash flow vs. revenue" }, points: [
        { zh: "购卡购课与手动入账新增“入流水 / 入营收 / 营收每日均摊”三个可选项，可自由组合", en: "Card purchases and manual entries now offer “record cash / record revenue / amortise daily”, freely combinable" },
        { zh: "默认口径随类别自动带出：私教评估只入流水，年卡与组合套餐每日均摊，团课卡购卡即确认营收", en: "Defaults follow the category: private & assessment record cash only, annual & package amortise daily, group cards recognise revenue at purchase" },
        { zh: "私教评估消课后可单独确认营收，撤销签到自动冲销，重复入账会被拦截", en: "Private & assessment sessions can recognise revenue separately; undoing a check-in reverses it automatically" },
        { zh: "结账方式新增“健身会员”，用于私教消课营收确认", en: "“Fitness member” added as a payment method for private-session revenue" },
        { zh: "流水列表新增“入账类型”标签，报表分列现金实收与确认营收", en: "The ledger gained an entry-type tag; reports separate cash received from recognised revenue" },
      ] },
      { title: { zh: "导出与小票", en: "Exports and receipts" }, points: [
        { zh: "账单小票按 14.5cm × 7.5cm 输出，含 Octave 抬头、入账类型、去税与增值税、签字栏与店址电话", en: "Receipts print at 14.5 × 7.5 cm with the Octave header, entry type, tax breakdown, signature line and store details" },
        { zh: "教室总览可导出次日排课安排，列出活动名称、类型、时间、教练、教室、预约人数与备注", en: "The room overview exports the next day’s schedule with name, type, time, guide, room, bookings and notes" },
        { zh: "财务流水明细与经营分析报表均可导出 PDF", en: "Transaction details and business reports can both be exported as PDF" },
      ] },
      { title: { zh: "会员自助资料与获客来源", en: "Member self-service and acquisition sources" }, points: [
        { zh: "会员端“我的”新增“个人信息”，可自助查看会员编号、入会时间与绑定手机号", en: "A new “Profile” tab in the member area shows the member number, join date and masked mobile" },
        { zh: "姓名与生日可自行修改，姓名不可为空、生日不可填未来日期", en: "Members can update their name and birth date, with the same validation as the front desk" },
        { zh: "更换手机号需原手机号与新手机号分别通过短信验证，两段验证码都通过才生效", en: "Changing the mobile number requires SMS verification of both the old and the new number" },
        { zh: "后台“获客来源”由自由输入改为下拉选择，内置 16 个行业常用渠道", en: "The acquisition source is now a dropdown with 16 standard industry channels" },
        { zh: "选择“其他”可补充说明；历史自定义写法仍可保留，不会被自动改写", en: "“Other” allows a detail note; existing custom values stay untouched" },
      ] },
      { title: { zh: "日常操作提效", en: "Everyday efficiency" }, points: [
        { zh: "教室总览时间轴从 07:00 起算，表头与房间名分离", en: "The room timeline now starts at 07:00 with a separate header row" },
        { zh: "颜色选择改为先选常用色、再进调色盘", en: "Colour picking now offers swatches first and a full palette on demand" },
        { zh: "课程图片改为本地上传并支持一键移除，去掉多余的图片网址输入框", en: "Class images upload from the device with one-click removal; the image-URL field is gone" },
        { zh: "排课时课程可搜索选择，与教练字段视觉分隔", en: "Classes can be searched when scheduling and are visually separated from the guide field" },
        { zh: "会员档案补齐字段名并放大字号，附件改为直接查看，资料区改为并排标签", en: "Member profiles gained field labels and larger type; attachments open inline and records sit in parallel tabs" },
        { zh: "课程与卡课产品的类目统一为中文口径", en: "Class and product categories now use one consistent Chinese set" },
      ] },
    ],
  },
  {
    date: "2026-11-18",
    version: APP_VERSION,
    title: { zh: "后台导航、课程库与角色能力矩阵", en: "Admin navigation, course library and the role capability matrix" },
    summary: { zh: "菜单可见性、页面可达性与操作权限统一由服务端下发的能力清单决定。", en: "Menu visibility, page access and action rights now all follow one capability list served by the backend." },
    groups: [
      { title: { zh: "导航重构", en: "Navigation" }, points: [
        { zh: "左侧菜单重新分组并按角色显示，隐藏的菜单其页面也打不开", en: "The sidebar is regrouped and role-aware; hidden sections are unreachable even by URL" },
        { zh: "“排课中心”移除私教排课，私教统一在“预约与签到 → 私教预约”完成", en: "Private scheduling left the scheduling centre and moved into private bookings" },
        { zh: "侧边栏底部的语言、操作指南与会员预约端收为三个精简图标按钮", en: "Language, user guide and member site collapsed into three compact icon buttons" },
      ] },
      { title: { zh: "课程库独立成页", en: "Course library" }, points: [
        { zh: "课程库提升为“资源与商品 → 课程库”独立页面，位置与其他资源一致", en: "The course library is now a first-class page under Resources & Products" },
        { zh: "支持类别、状态与名称筛选，卡片与列表视图可切换", en: "Filter by category, status and name; switch between card and list views" },
        { zh: "新增、编辑、启停、图片上传与移除、移入回收站增删改查齐全", en: "Create, edit, activate, image upload and removal, and recycling all work here" },
      ] },
      { title: { zh: "角色能力矩阵", en: "Role capabilities" }, points: [
        { zh: "19 项能力 × 5 种角色的矩阵，后台可直接查看，菜单与接口共用同一判定", en: "A 19-capability × 5-role matrix, viewable in the admin and shared by menus and APIs" },
        { zh: "教练可书写跟进记录但不能改会员资料与财务；财务可维护产品与核销但不能改排课", en: "Guides can log follow-ups but not edit members or finance; finance can maintain products but not the schedule" },
        { zh: "前台保留电子码核销，不再显示完整收支流水", en: "Front desk keeps code redemption but no longer sees the full ledger" },
      ] },
    ],
  },
  {
    date: "2026-11-18",
    version: APP_VERSION,
    title: { zh: "教练账号关联、员工自助与数据一致性修复", en: "Instructor accounts, staff self-service and data consistency fixes" },
    summary: { zh: "教练与员工账号打通，员工可自助管理资料；同时修复了座位扣减等数据一致性缺陷。", en: "Instructor and staff accounts are linked and staff can self-manage their details; seat-count and consistency bugs are fixed." },
    groups: [
      { title: { zh: "账号与资料", en: "Accounts and profiles" }, points: [
        { zh: "教练档案可关联角色为“教练”的员工账号，一账号只关联一位教练", en: "An instructor can be linked to one instructor-role staff account, one account per instructor" },
        { zh: "教练移入回收站时关联账号自动停用，恢复或彻底删除后随之还原", en: "Recycling an instructor disables the linked account and restoring brings it back" },
        { zh: "左下角头像可打开个人中心，任何角色都能改姓名与手机号、自助修改密码", en: "The avatar opens a personal centre where any staff member can edit their name, mobile and password" },
        { zh: "登录名、角色与启停仍由管理员统一管理", en: "Usernames, roles and activation stay under administrator control" },
      ] },
      { title: { zh: "本次修复", en: "Fixes" }, points: [
        { zh: "修复后台取消预约时课程剩余席位被重复扣减", en: "Fixed reserved seats being deducted twice when a booking is cancelled" },
        { zh: "修复同一导入文件内重复手机号导致整批导入失败", en: "Fixed duplicate numbers inside one import file failing the whole batch" },
        { zh: "会员卡改为版本校验的乐观锁，避免并发修改互相覆盖", en: "Membership cards now use version-checked optimistic locking" },
        { zh: "撤销签到与取消预约统一返还权益并冲销营收", en: "Undoing a check-in or cancelling now restores benefits and reverses revenue" },
        { zh: "价格、次数、有效天数等字段增加范围校验并给出中文提示", en: "Price, session count and validity inputs are range-checked with clear messages" },
      ] },
    ],
  },
  {
    date: "2026-11-11",
    version: "1.0.0",
    title: { zh: "首个正式版本：预约、签到、购卡与经营闭环", en: "First release: booking, check-in, cards and operations" },
    summary: { zh: "覆盖会员预约、双向二维码签到、购卡申请、排课与教室、会员档案与卡课权益、财务与报表、数据维护与开放 API。", en: "Covers member booking, two-way QR check-in, card requests, scheduling, profiles, finance, reporting, data maintenance and the open API." },
    groups: [
      { title: { zh: "会员端", en: "Member site" }, points: [
        { zh: "手机号验证码登录、日周月课表、分类筛选与手机日历导出", en: "Phone-code sign-in, day/week/month schedules, category filters and calendar export" },
        { zh: "会员与课程两种动态二维码签到，重复扫码幂等，误签到可撤销并返还权益", en: "Two dynamic QR flows for member and class check-in; repeats are idempotent and mistakes can be undone" },
        { zh: "购卡申请需二次确认，生成电子码到店核销，支持会员自主申请退款", en: "Card requests need confirmation and produce a redeemable code; members can request refunds" },
      ] },
      { title: { zh: "后台与开放能力", en: "Admin and open API" }, points: [
        { zh: "排课、教室、教练、会员档案、会员卡与体验券的完整维护", en: "Full management of sessions, rooms, instructors, members, cards and vouchers" },
        { zh: "财务入账、经营报表、PDF 导出与自动备份", en: "Finance entry, business reports, PDF exports and automatic backups" },
        { zh: "开放 API 支持 API Key 与细粒度 scope，回收站支持误删恢复", en: "The open API uses keys with fine-grained scopes, and the recycle bin restores accidental deletions" },
      ] },
    ],
  },
];
