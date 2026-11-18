"""角色权限模型：全系统唯一的“角色 → 能力”定义处。

后台菜单、路由守卫与操作按钮都按这里的 `CAPABILITIES` 判断，
前端 `src/lib/permissions.ts` 与本文件保持一致。
新增角色或调整权限时，只改这里和前端同一份矩阵。
"""

ROLE_LABELS = {
    "admin": "IT / 管理员",
    "finance": "财务",
    "frontdesk": "前台",
    "teacher": "教练",
    "viewer": "只读",
}

# 能力分组，仅用于权限矩阵展示与说明文案。
CAPABILITY_GROUPS = [
    ("dashboard.view", "经营概览", "查看今日课程、预约与本月营收概览"),
    ("bookings.view", "预约查看", "查看团课、私教与工作坊的预约名单"),
    ("bookings.write", "预约与排课", "新建排课、代客预约、签到、取消与爽约处理"),
    ("members.view", "会员查看", "查看会员档案、卡权益与跟进记录"),
    ("members.write", "会员维护", "新建与修改会员资料、附件与爽约限制"),
    ("records.write", "跟进记录", "书写私教与跟进记录"),
    ("cards.write", "会员卡权益", "延期、冻结、转卡、共享与体验券管理"),
    ("revenue.write", "收款与核销", "购卡、升额、电子码核销与消课营收确认"),
    ("catalog.view", "资源查看", "查看课程、教练与教室目录"),
    ("catalog.write", "资源维护", "维护课程、教练与教室资料"),
    ("products.view", "产品查看", "查看卡课产品与价格"),
    ("products.write", "产品维护", "新建与修改卡课产品"),
    ("finance.view", "财务查看", "查看收支流水与对账单"),
    ("finance.write", "财务记账", "手工入账、修改与退款"),
    ("reports.view", "报表分析", "查看经营报表与营收构成"),
    ("recycle.write", "回收站删除", "将数据移入回收站"),
    ("recycle.view", "回收站管理", "查看与恢复回收站数据"),
    ("settings.view", "系统设置查看", "查看账号、短信、密钥与日志"),
    ("settings.write", "系统设置维护", "维护账号、短信、品牌与系统设置"),
]

CAPABILITIES = [capability for capability, _label, _hint in CAPABILITY_GROUPS]

# 每个角色的能力集合：遵循最小权限原则，只读角色不能写任何业务数据。
ROLE_CAPABILITIES: dict[str, set[str]] = {
    "admin": set(CAPABILITIES),
    "finance": {
        "dashboard.view", "bookings.view", "members.view", "catalog.view",
        "products.view", "products.write", "revenue.write", "finance.view",
        "finance.write", "reports.view", "recycle.write",
    },
    "frontdesk": {
        "dashboard.view", "bookings.view", "bookings.write", "members.view",
        "members.write", "records.write", "cards.write", "revenue.write",
        "catalog.view", "products.view", "reports.view", "recycle.write",
    },
    "teacher": {
        "dashboard.view", "bookings.view", "members.view", "records.write",
        "catalog.view",
    },
    "viewer": {
        "dashboard.view", "bookings.view", "members.view", "catalog.view",
        "products.view", "finance.view", "reports.view",
    },
}


def has_capability(role: str, capability: str) -> bool:
    """判断角色是否具备某项能力；未知角色按无权限处理。"""
    return capability in ROLE_CAPABILITIES.get(role, set())


# 回收站资源 → 删除该类数据所需的能力，与 recycle_service 的角色白名单对应。
RESOURCE_CAPABILITIES: dict[str, str] = {
    "users": "settings.write",
    "members": "members.write",
    "teachers": "catalog.write",
    "rooms": "catalog.write",
    "courses": "catalog.write",
    "sessions": "bookings.write",
    "products": "products.write",
    "cards": "cards.write",
    "bookings": "bookings.write",
    "shares": "cards.write",
    "vouchers": "cards.write",
    "reminders": "members.write",
    "room-reservations": "bookings.write",
    "records": "records.write",
    "documents": "members.write",
    "transactions": "finance.write",
    "api-keys": "settings.write",
}


def can_manage_resource(role: str, resource: str) -> bool:
    """判断角色能否把该类资源移入回收站。"""
    capability = RESOURCE_CAPABILITIES.get(resource)
    if not capability:
        return False
    return has_capability(role, capability)


def role_capabilities(role: str) -> list[str]:
    """返回角色拥有的能力列表，顺序与 CAPABILITY_GROUPS 一致。"""
    owned = ROLE_CAPABILITIES.get(role, set())
    return [capability for capability in CAPABILITIES if capability in owned]


def permission_matrix() -> list[dict]:
    """权限矩阵，供后台“账号权限”页面展示。"""
    return [
        {
            "capability": capability,
            "label": label,
            "hint": hint,
            "roles": [role for role in ROLE_LABELS if has_capability(role, capability)],
        }
        for capability, label, hint in CAPABILITY_GROUPS
    ]
