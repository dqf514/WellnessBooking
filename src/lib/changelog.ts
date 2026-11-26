// 系统版本与更新日志：后台“系统设置 → 更新日志”展示，按日期为分界列出主要内容。
export const APP_VERSION = "1.1.0";
export const APP_RELEASE_DATE = "2026-11-26";
export const API_VERSION = "v1.0.0";
export const API_ENDPOINT_COUNT = 146;

export interface ChangelogText { zh: string; en: string }
export interface ChangelogGroup { title: ChangelogText; points: ChangelogText[] }
export interface ChangelogRelease { date: string; version: string; title: ChangelogText; summary: ChangelogText; groups: ChangelogGroup[] }

export const changelogReleases: ChangelogRelease[] = [
  {
    date: "2026-11-26",
    version: APP_VERSION,
    title: { zh: "会员名单只留真客户、评估单列、通知群发与 Outlook 日历导入", en: "Member lists keep only real card holders, assessments split out, notices and Outlook calendar import" },
    summary: { zh: "会员列表与导出只统计真正买过卡的客户，可按卡种多选；评估预约独立成页，签到后可直接点进会员档案；后台新增会员群发通知与 Outlook 会议室日历导入，并准备了会员手机端操作指南 PDF。", en: "Member lists and exports now count only people who actually bought a card and can be filtered by card type; assessment bookings have their own page and the roster links straight into a member profile; the admin gains scheduled member notices, Outlook room-calendar import, and a ready-to-send member app guide PDF." },
    groups: [
      { title: { zh: "名单与导出", en: "Lists and exports" }, points: [
        { zh: "会员列表、报表导出和“当月新进会员”只显示真正买过卡的客户，散客不再混进来", en: "Member lists, report exports and “new this month” only include people who actually bought a card" },
        { zh: "导出前可按卡种多选：团课、私教、年卡/组合套餐", en: "Before exporting you can pick card types: group classes, private training, annual / package" },
        { zh: "会员列表默认按会员卡种类自动排序，底部显示每种卡的人数", en: "The member list sorts by card type by default and shows how many people hold each card" },
        { zh: "“套餐”统一改称“年卡/组合套餐”，“新建会员”改称“新建客户”", en: "“Package” is now “annual / package”, and “New member” is now “New customer”" },
      ] },
      { title: { zh: "评估与会员档案", en: "Assessments and member profiles" }, points: [
        { zh: "健康评估从私教中独立出来，后台新增“评估预约”，签到时只扣评估权益", en: "Health assessments now stand apart from private training; a new “Assessment bookings” page consumes only the assessment benefit" },
        { zh: "私教/评估签到名单里点会员名字可直接打开会员档案，不用再回会员列表里找", en: "Tap a name in the private/assessment roster to open that member’s profile right away" },
        { zh: "会员档案头部的照片、姓名与信息整体放大，一行放不下自动折行", en: "The member profile header is enlarged and wraps onto extra lines when needed" },
        { zh: "常用颜色补全，去掉点不开的“更多颜色”，改为提示点击左边色块选择", en: "Common colours are completed; the broken “more colours” button is replaced by a hint to tap the swatches" },
      ] },
      { title: { zh: "入账方式与通知", en: "Revenue options and notices" }, points: [
        { zh: "购卡与升卡都可以像手动入账一样选择“入流水 / 入营收 / 营收每日均摊”，并提示系统默认口径", en: "Buying and upgrading cards can now choose “cash only / recognise revenue / spread daily”, with the system default shown" },
        { zh: "后台新增“会员通知”，可预约发送日期，到点自动群发短信，也能一键取消", en: "A new “Member notices” page can schedule a date and send SMS automatically, or be cancelled" },
        { zh: "内置“预约系统切换”通知模板，填入 12 月 1 日启用新系统的说明即可", en: "A built-in “system switch” template is ready for announcing the new booking system" },
        { zh: "会员手机端操作指南 PDF 可在通知页一键下载后转发给会员", en: "The member app guide PDF can be downloaded from the notices page and forwarded to members" },
      ] },
      { title: { zh: "Outlook 日历", en: "Outlook calendar" }, points: [
        { zh: "教室页可导入 Outlook 会议室日历（.ics），自动生成教室占用", en: "The rooms page can import an Outlook room calendar (.ics) and create the room bookings for you" },
        { zh: "按日程地点自动匹配教室，也可手动指定；同一日程重复导入不会重复占用", en: "Rooms are matched from the event location or picked manually; re-importing the same event creates no duplicate" },
        { zh: "与已有课程冲突的日程会跳过，不会覆盖现有排课", en: "Events that clash with existing classes are skipped rather than overwriting them" },
      ] },
    ],
  },
  {
    date: "2026-11-23",
    version: APP_VERSION,
    title: { zh: "登录更安全：图片验证码、短信二次验证与演示账号开关", en: "Safer sign-in: image captcha, SMS two-step verification and a demo-account switch" },
    summary: { zh: "员工账号密码登录现在带图片验证码；后台可开启短信二次验证（MFA），口令通过后还要手机号验证码才算登录成功。测试期自动填入 admin / admin123 的便利也做成了开关，正式上线前关掉即可。", en: "Staff password sign-in now asks for an image captcha. Administrators can enable SMS two-step verification (MFA) so a valid password still needs a code on the bound phone. The test-period auto-fill of admin / admin123 is now a switch you turn off before going live." },
    groups: [
      { title: { zh: "登录安全", en: "Sign-in security" }, points: [
        { zh: "账号密码登录新增 4 位图片验证码，挡住脚本批量试密码", en: "Password sign-in now adds a 4-character image captcha to block scripted guessing" },
        { zh: "看不清可点击图片刷新，5 分钟有效、一次一用", en: "Click the image to refresh; valid for 5 minutes and single-use" },
        { zh: "短信二次验证（MFA）默认关闭，可在“系统设置 → 场馆与预约 → 登录安全”里开启", en: "SMS two-step verification (MFA) is off by default and can be enabled under “Settings → Venue & booking → Sign-in security”" },
        { zh: "开启后口令通过后还要输入绑定手机号收到的验证码，未绑定手机号的员工需先补手机号", en: "When on, a valid password still needs the code sent to the bound mobile number; staff without one must add it first" },
      ] },
      { title: { zh: "上线前开关", en: "Go-live switches" }, points: [
        { zh: "“登录页自动填充演示账号”可一键关闭，登录页不再显示 admin / admin123", en: "One click turns off the prefilled demo account, and the page no longer shows admin / admin123" },
        { zh: "服务器环境变量 LOGIN_DEMO_CREDENTIALS=false 可强制关闭，后台勾选不再生效", en: "The LOGIN_DEMO_CREDENTIALS=false environment variable forces it off and overrides the admin checkbox" },
        { zh: "预约成功短信默认措辞去掉“预约编号”，避免被运营商判为敏感词", en: "The default booking SMS no longer says “预约编号”, which carriers can flag as a blocked word" },
        { zh: "短信模板可在“系统设置 → 短信通知”里随时改写，保存即生效", en: "SMS templates can be reworded any time under “Settings → SMS notifications”, effective as soon as you save" },
      ] },
    ],
  },
  {
    date: "2026-11-23",
    version: APP_VERSION,
    title: { zh: "照片上传可裁剪，头像按页面显示取景", en: "Crop photos before upload so avatars match the page" },
    summary: { zh: "选好照片后先弹出裁剪窗口：拖动照片调整位置、滑块放大缩小，方框里看到的就是保存后头像的样子。会员端自传、后台代传、教练照片与课程图片共用同一个裁剪窗口。", en: "Picking a photo now opens a crop window: drag to reposition, zoom with the slider, and the frame shows exactly how the avatar will look. Member self-service, staff uploads, instructor portraits and class images all share it." },
    groups: [
      { title: { zh: "裁剪窗口", en: "The crop window" }, points: [
        { zh: "拖动照片移动位置，滑块缩放，框内即最终取景", en: "Drag to reposition, zoom with the slider; the frame is the final framing" },
        { zh: "提供“重置 / 取消 / 确认裁剪”，取消不保存任何内容", en: "Reset, cancel or apply — cancelling changes nothing" },
        { zh: "会员照片按方形保存（640 × 640），头像、会员清单与签到名单显示一致", en: "Member photos are saved square (640 × 640), so the avatar, member list and check-in roster match" },
      ] },
      { title: { zh: "覆盖范围", en: "Where it applies" }, points: [
        { zh: "会员端“我的 → 个人信息 → 会员照片”，手机可直接拍照", en: "Member site: “Me → Profile → Profile photo”, with the phone camera on mobile" },
        { zh: "后台会员档案“上传照片”，前台可代会员调整取景", en: "Admin member profile: staff can set the framing for the member" },
        { zh: "教练照片按竖版比例（120 : 140）裁剪，课程图片按方形裁剪", en: "Instructor portraits crop to a portrait frame (120 : 140), class images to a square" },
        { zh: "课程图片可点“使用原图”保留原始文件", en: "Class images can keep the original file with “Use original”" },
      ] },
    ],
  },
  {
    date: "2026-11-23",
    version: APP_VERSION,
    title: { zh: "会员端手机改成多页：底部按钮切换", en: "The member app on phones becomes multi-page with a bottom tab bar" },
    summary: { zh: "手机端不再是一整页从上拉到底，底部新增首页、预约、引导者、卡课、我的五个按钮，点哪个显示哪个页面；“我的”成为独立页面。电脑端保持原来的整页滚动样式不变。", en: "Phones no longer scroll through one long page: a bottom bar switches between Home, Book, Guides, Cards and Me, and “Me” is now a page of its own. The desktop layout is unchanged." },
    groups: [
      { title: { zh: "手机端多页", en: "Multi-page on phones" }, points: [
        { zh: "底部新增五个导航按钮：首页、预约、引导者、卡课、我的", en: "Five bottom tabs: Home, Book, Guides, Cards and Me" },
        { zh: "每个页面只放一类内容，“我的”是独立页面，含个人信息、我的预约、我的会员卡、购卡记录与到店签到", en: "Each page holds one topic; “Me” is a page with profile, bookings, cards, card orders and check-in" },
        { zh: "当前页面按钮加深加粗，一眼看出所在位置", en: "The active tab is highlighted so you always know where you are" },
        { zh: "未登录点“我的”直接弹出登录窗口，登录后自动进入“我的”", en: "Tapping “Me” while signed out opens the sign-in window, and lands on “Me” once signed in" },
      ] },
      { title: { zh: "桌面端", en: "On the desktop" }, points: [
        { zh: "电脑版仍是完整的一整页，从上往下依次浏览，不显示底部导航", en: "The desktop keeps the full scrolling page and shows no bottom bar" },
        { zh: "右上角头像仍然弹出“我的”窗口，与手机端功能完全一致", en: "The avatar in the top right still opens the “Me” dialog, with exactly the same content as on phones" },
        { zh: "上一版的“点标题展开”折叠区被多页导航取代，手机端引导者与卡课现在各自独立成页", en: "The previous tap-to-expand sections are replaced by the tab bar; guides and cards are now pages of their own" },
      ] },
    ],
  },
  {
    date: "2026-11-22",
    version: APP_VERSION,
    title: { zh: "会员端更顺手：登录简化、已约可取消、手机端教室总览", en: "A smoother member app: simpler login, one-tap cancel, mobile room overview" },
    summary: { zh: "会员端登录只需手机号加验证码，预约后按钮变为“已约”可直接取消；手机端教室总览能看到全部教室并支持缩放拖拽；后台弹窗报错不再需要关掉弹窗才看得见。", en: "Member login now needs only a phone number and code, booked classes can be cancelled with one tap, the mobile room overview shows every room with pinch-to-zoom, and admin errors show on top of open dialogs." },
    groups: [
      { title: { zh: "会员端登录与预约", en: "Member login and booking" }, points: [
        { zh: "登录只保留手机号与验证码，去掉姓名输入框，验证码打开弹窗即自动发送", en: "Login now only asks for a phone number and code; the name field is gone and the code is sent automatically" },
        { zh: "记住上次登录的手机号，下次打开直接输验证码即可", en: "The phone number is remembered, so the next sign-in only needs the code" },
        { zh: "预约成功后按钮变为“已约”，点一下就能取消预约，不用再去“我的预约”里找", en: "After booking the button turns into “Booked” and a tap cancels the booking right away" },
        { zh: "团课预约界面只显示团课，不再混入私教与评估", en: "The group-class booking view only lists group classes" },
      ] },
      { title: { zh: "手机端体验", en: "On the phone" }, points: [
        { zh: "“身心引导者”与“会员卡课”改为点按展开，手机端不再一屏拉得很长", en: "Guides and membership cards now collapse behind a tap on the phone" },
        { zh: "日期条适配大字体与窄屏，周日等最后一天完整显示不再被裁掉", en: "The date strip fits large font sizes and narrow screens, so the last day is no longer cut off" },
        { zh: "教室总览新增全部教室色块条与紧凑列表，手机上一次就能看到所有教室的安排", en: "The room overview gains a chip bar and a compact list so every room is visible on a phone" },
        { zh: "手机端新增全屏排课表入口，双指缩放、单指拖动，大屏布局保持不变", en: "The full-screen schedule is now available on phones with pinch-to-zoom and drag; the big-screen layout is unchanged" },
      ] },
      { title: { zh: "后台可见性", en: "Admin visibility" }, points: [
        { zh: "弹窗里的操作失败时，报错直接浮在弹窗上方，不用关掉弹窗才发现没成功", en: "When an action inside a dialog fails, the error appears on top of the dialog instead of behind it" },
        { zh: "会员端年卡类目改为中文：体测评估 / 团课 / 私教 / 工作坊", en: "Annual card categories read 体测评估 / 团课 / 私教 / 工作坊" },
        { zh: "会员端“申请购卡”改为“线下购买”", en: "“Request card” is now “Buy at studio”" },
      ] },
    ],
  },
  {
    date: "2026-11-22",
    version: APP_VERSION,
    title: { zh: "财务入账：按结账方式查账，合计口径更清楚", en: "Finance ledger: filter by payment method with clearer totals" },
    summary: { zh: "财务入账新增结账方式多选筛选，合计金额改名为流水总额、营收总额与退款总额，报表中心也能按结账方式筛选。", en: "The finance ledger gains a multi-select payment-method filter; totals are renamed to ledger, revenue and refund totals, and the report centre can filter by payment method too." },
    groups: [
      { title: { zh: "按结账方式查账", en: "Filter by payment method" }, points: [
        { zh: "财务入账新增结账方式多选筛选，现金、微信、有赞、大众点评等可同时勾选", en: "The ledger now filters by payment method; cash, WeChat, Youzan, Dianping and more can be selected together" },
        { zh: "导出的财务流水 PDF 沿用当前筛选，并在抬头注明类别与结账方式", en: "Exported ledger PDFs keep the current filter and note the category and payment methods in the header" },
        { zh: "报表中心选择财务流水数据源时，可先按结账方式筛选再分组统计", en: "In the report centre, the transaction dataset can be filtered by payment method before grouping" },
      ] },
      { title: { zh: "合计口径", en: "Totals" }, points: [
        { zh: "合计改为流水总额（已扣退款）、营收总额（已扣退款）与退款总额三项", en: "Totals are now ledger total (net of refunds), revenue total (net of refunds) and refund total" },
        { zh: "三项金额都跟随筛选条件同步变化", en: "All three totals follow the current filters" },
      ] },
    ],
  },
  {
    date: "2026-11-22",
    version: APP_VERSION,
    title: { zh: "报表中心：多种维度报表与 Excel 导出", en: "Report centre: multi-dimension reports with Excel export" },
    summary: { zh: "报表页升级为报表中心，销售、财务、管理、总经理与会员经营各有预设，维度与指标可自由组合，全部改为导出 Excel。", en: "The reports page is now a report centre with presets for sales, finance, management, executive and member views; dimensions and metrics combine freely and every report exports to Excel." },
    groups: [
      { title: { zh: "报表类型", en: "Report types" }, points: [
        { zh: "销售业绩报表：按顾问与产品看合同金额、笔数与客单价", en: "Sales report: contract amount, entry count and average order by advisor and product" },
        { zh: "财务报表：按月份与类别看现金实收、确认营收、退款与流水笔数", en: "Finance report: cash received, recognised revenue, refunds and entries by month and category" },
        { zh: "教学管理报表：按教练看排课、取消、上课人次、课时与出席率", en: "Management report: classes, cancellations, attendance, hours and attendance rate by instructor" },
        { zh: "总经理经营报表与会员经营报表：月度趋势与会员规模、到期情况", en: "Executive and member reports: monthly trends plus member size and expiries" },
      ] },
      { title: { zh: "自定义与导出", en: "Customisation and export" }, points: [
        { zh: "数据源、分组维度、统计指标都能自行勾选，切换后立即重算并给出合计行", en: "Pick the data source, grouping dimensions and metrics yourself; results recalculate instantly with a totals row" },
        { zh: "经营总览导出为多页签 Excel：总览、分类汇总、课程、教练与教室使用率各一页", en: "The overview exports as a multi-sheet Excel: summary, categories, classes, instructors and room usage" },
        { zh: "报表一律导出 Excel，原“导出报表 PDF”已取消，财务流水与账单小票 PDF 不变", en: "Reports now export to Excel only; the report PDF is gone, while the transaction ledger and receipt PDFs stay" },
      ] },
    ],
  },
  {
    date: "2026-11-22",
    version: APP_VERSION,
    title: { zh: "会员照片、名单导出、会员卡操作与开卡日期待定", en: "Member photos, roster export, card operations and pending card start" },
    summary: { zh: "补齐会员照片与名单导出，会员卡支持编辑、续卡、请假停卡与跨类目升卡，并把开卡日期与营收口径交还给管理员。", en: "Member photos and Excel roster export are in; membership cards can be edited, renewed, paused and upgraded; card start date and revenue policy are now admin-controlled." },
    groups: [
      { title: { zh: "会员资料", en: "Member profiles" }, points: [
        { zh: "会员新增照片字段，会员端可自行拍照上传，后台也能代为更换或移除", en: "Members now have a photo: they can take and upload one themselves, and staff can replace or remove it" },
        { zh: "会员列表支持按名称、手机号、卡状态与来源筛选，筛选结果可导出 Excel 名单", en: "The member list filters by name, phone, card status and source, and the filtered result exports to Excel" },
      ] },
      { title: { zh: "会员卡操作", en: "Card operations" }, points: [
        { zh: "会员卡新增编辑、续卡、请假停卡与跨类目升卡四类操作，卡片上直接进入", en: "Cards gained edit, renew, pause and cross-category upgrade actions, all reachable from the card itself" },
        { zh: "续卡即重新购卡，保留原卡的记录并生成新的购卡流水", en: "Renewing is simply buying again: the old card is kept and a new purchase record is created" },
        { zh: "请假停卡只冻结冻结区间内的权益，区间之外照常可用", en: "A paused card only freezes benefits inside the paused window; outside it the card works normally" },
        { zh: "升卡自动结转原卡剩余次数与有效期并生成升卡流水", en: "Upgrading carries over remaining sessions and validity and produces an upgrade record" },
      ] },
      { title: { zh: "开卡日期待定与营收口径", en: "Pending start and revenue policy" }, points: [
        { zh: "购卡时可选择“开卡日期待定”，卡片立即可用，首次签到当天自动开卡并按产品有效期顺延", en: "A card can be bought with a pending start date: it is usable at once and opens automatically on the first check-in" },
        { zh: "撤销签到时若本次才开卡，会退回“开卡日期待定”状态，均摊起始日一并清空", en: "Undoing the check-in that opened a pending card returns it to pending and clears the amortisation start" },
        { zh: "营收确认口径移入系统设置，可选按卡种自动、购卡即全额确认或按有效期每日均摊", en: "Revenue policy moved to system settings: automatic by card type, full recognition at purchase, or daily amortisation" },
        { zh: "私教与评估类始终不入营收，实际消课后单独确认，规则不受全局设置影响", en: "Private and assessment sessions never enter revenue at purchase; they are recognised after delivery, regardless of the global setting" },
      ] },
    ],
  },
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
      { title: { zh: "教室总览导航", en: "Room overview navigation" }, points: [
        { zh: "教室总览顶部新增左右滚动按键，不用再拖到页面底部的滚动条", en: "Left and right buttons at the top of the room overview replace the bottom scrollbar" },
        { zh: "顶部教室色块按当天安排着色：绿=有排课、橙=仅内部占用、灰=空闲", en: "Room chips are coloured by the day's schedule: green=classes, amber=reserved, grey=free" },
        { zh: "点击色块即可横向定位到对应教室，色块条与表格滚动位置联动", en: "Click a chip to jump to that room; the chip strip follows the table's scroll position" },
        { zh: "左右按键在该方向存在有排课的教室时高亮提示", en: "The scroll buttons highlight when scheduled classes lie in that direction" },
        { zh: "教室列宽压缩到 104 像素，一屏可见更多教室，横向滚动时时间轴保持可见", en: "Room columns narrowed to 104px so more fit on screen, and the time axis stays visible while scrolling" },
      ] },
      { title: { zh: "会员档案头部重排", en: "Member profile header" }, points: [
        { zh: "会员档案头部改为一行：头像旁是中文名（大字）与英文名（小字）", en: "The member profile header is now one row: the Chinese name in large type with the English name in small type beside it" },
        { zh: "头像改为深底白字，与浅色背景形成反差，文字清晰可辨", en: "The avatar now uses a dark background with light text for clear contrast" },
        { zh: "手机号、性别、出生日期、获客来源、会籍归属、微信号、紧急联系合并为一行铺满宽度", en: "Mobile, gender, birth date, source, advisor, WeChat and emergency contact now share one full-width row" },
        { zh: "会员备注直接显示在头部下方，打开档案即可看到", en: "Member notes now appear directly under the header" },
        { zh: "整体压缩上下留白，把会员卡与记录表的可用高度让出来", en: "Vertical padding is trimmed so the cards and record tables below get more room" },
      ] },
      { title: { zh: "教室总览大屏视图", en: "Room overview big screen" }, points: [
        { zh: "右上角新增“全屏排课表”按钮，一键打开整屏排课表，适合放在公共区域的大屏幕", en: "A “Full screen” button in the top-right action bar opens the full-screen schedule for a public display" },
        { zh: "浏览器同时进入全屏（等同按 F11），地址栏与工具栏全部隐藏，屏幕上只剩排课内容", en: "The browser enters full screen too (like pressing F11), hiding the address bar and toolbars so only the schedule remains" },
        { zh: "全屏铺开所有教室，教室多时自动压缩列宽、屏幕放不下时自动压缩行高，无需上下左右滚动", en: "All rooms are laid out at once; column width and row height shrink automatically so nothing needs scrolling" },
        { zh: "日期与实时时钟置于标题栏正中，时钟精确到秒并逐秒走动", en: "The date and a live clock sit in the centre of the header, the clock ticking to the second" },
        { zh: "左右方向键切换日期，Esc 退出，Ctrl+P 直接打印当前画面", en: "Arrow keys change the date, Esc exits, and Ctrl+P prints the current view" },
        { zh: "打印按 A3 横向排版，一天的完整安排正好一页纸", en: "Printing uses A3 landscape, fitting a whole day on a single page" },
        { zh: "排课块高度覆盖所在的整段时间区间，块内只显示时间段与主题，字号随格子大小自适应", en: "Each block covers the full time range it occupies, showing only the time range and title, with the font scaled to the cell" },
      ] },
      { title: { zh: "大屏深色模式", en: "Dark mode for the big screen" }, points: [
        { zh: "全屏排课表支持浅色 / 深色两种模式，标题栏右上角一键切换，选择结果会被记住", en: "The full-screen schedule now supports light and dark modes, toggled from the header and remembered for next time" },
        { zh: "深色下底色改为墨绿黑，课程色块保留各自颜色并重新调校对比度，网格线与文字更适合远看", en: "Dark mode uses a deep pine background with re-tuned course colours, grid lines and text for long-distance reading" },
        { zh: "打印时无论当前模式，一律输出浅色版本，保证白纸上可读", en: "Printing always outputs the light version so it stays readable on paper" },
      ] },
      { title: { zh: "教室总览布局收紧", en: "Tighter room overview layout" }, points: [
        { zh: "日期选择并入左上角，下拉框左右各加一个箭头，直接翻上一日、下一日", en: "The date picker moved to the top left with arrows on both sides for the previous and next day" },
        { zh: "表格上方那一整行（上一日/下一日 + 全屏按钮）整体移除，高度全部留给下方表格", en: "The whole row with the date arrows and full-screen button was removed, giving all its height to the table" },
        { zh: "全屏排课表按钮移到右上角按钮区，放在“导出安排 PDF”与“预约教室”之间", en: "The full-screen button moved to the top-right action bar, between Export PDF and Reserve room" },
        { zh: "每小时行高由 60px 收到 44px，同一屏可看到 07:00–20:00 的完整安排", en: "Row height dropped from 60px to 44px per hour, so 07:00–20:00 fits on one screen" },
      ] },
      { title: { zh: "经营概览今日安排", en: "Today's schedule on the dashboard" }, points: [
        { zh: "概览面板由“今日课程”改为“今日安排”，教室里的内部使用、公司活动、企业活动也一并列出", en: "The dashboard panel is now “Today's schedule”; internal use, company and corporate events in rooms are listed too" },
        { zh: "课程与教室占用按时间混排，右侧用标签区分类型：课程显示已约/容量，占用显示类型", en: "Classes and room reservations are mixed by time, tagged on the right to tell them apart" },
        { zh: "“完整课表”改为直接打开教室大屏并进入浏览器全屏，投屏一步到位", en: "“Full schedule” now opens the room big screen straight into browser full screen" },
        { zh: "修复教室总览左侧时间刻度整体上移一格的问题，刻度与网格线、课程块严格对齐", en: "Fixed the room overview time labels sitting one hour too high; they now line up with the grid and blocks" },
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
