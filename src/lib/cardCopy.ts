/** 会员卡显示状态与分组的统一文案，与服务端 backend/app/card_state.py 保持一致。 */

export type CardDisplayStatus = "active" | "pending" | "expired" | "used_up" | "void" | "upgraded" | "frozen";

/** 显示状态 → [中文, English]；正常=绿、未激活=黄、已过期/已用完=红、其余=灰。 */
export const CARD_STATUS_COPY: Record<string, [string, string]> = {
  active: ["正常", "Active"],
  pending: ["未激活", "Not activated"],
  expired: ["已过期", "Expired"],
  used_up: ["已用完", "Used up"],
  void: ["已销卡", "Cancelled"],
  upgraded: ["已升卡", "Upgraded"],
  frozen: ["已冻结", "Frozen"],
};

export const CARD_STATUS_TONES: Record<string, "neutral" | "green" | "red" | "amber" | "blue"> = {
  active: "green",
  pending: "amber",
  expired: "red",
  used_up: "red",
  void: "neutral",
  upgraded: "neutral",
  frozen: "amber",
};

/** 卡片显示状态；老数据没有该字段时按开始时间与剩余次数兜底判断。 */
export function cardDisplayStatus(card: { display_status?: string; status?: string; start_pending?: boolean; expires_on?: string; total_sessions?: number | null; remaining_sessions?: number | null }): string {
  if (card.display_status) return card.display_status;
  if (card.status === "cancelled") return "void";
  if (card.status === "upgraded") return "upgraded";
  if (card.status === "frozen") return "frozen";
  if (card.status === "used") return "used_up";
  if (card.start_pending) return "pending";
  if (card.expires_on && card.expires_on < new Date().toISOString().slice(0, 10)) return "expired";
  if (card.total_sessions !== null && card.total_sessions !== undefined && (card.remaining_sessions ?? 0) <= 0) return "used_up";
  return "active";
}

export function cardStatusLabel(status: string, local: (zh: string, en?: string) => string) {
  const copy = CARD_STATUS_COPY[status] ?? ["其他", "Other"];
  return local(copy[0], copy[1]);
}

export function cardStatusTone(status: string) {
  return CARD_STATUS_TONES[status] ?? "neutral";
}

/** 卡种分组：团课 / 私教 / 体测评估 / 年卡·组合套餐 / 工作坊 / 其他。 */
export const CARD_CATEGORY_GROUPS: Array<{ key: string; zh: string; en: string }> = [
  { key: "group", zh: "团课", en: "Group" },
  { key: "private", zh: "私教", en: "PT" },
  { key: "assessment", zh: "体测评估", en: "Assessment" },
  { key: "annual", zh: "年卡 / 组合套餐", en: "Annual / package" },
  { key: "workshop", zh: "工作坊", en: "Workshop" },
  { key: "other", zh: "其他", en: "Other" },
];

export function cardCategoryGroup(category: string) {
  const value = category || "";
  if (value === "group") return "group";
  if (value === "private") return "private";
  if (value === "assessment") return "assessment";
  if (value === "annual" || value === "package") return "annual";
  if (value === "workshop") return "workshop";
  return "other";
}
