import type { Transaction } from "@/types";

export const productCategories = ["group", "private", "annual", "workshop", "training"];
export const financeCategories = ["group", "private", "annual", "workshop", "training", "enterprise", "misc"];
const categoryCopy: Record<string, [string, string]> = {
  group: ["团课", "Group classes"],
  private: ["私教/评估", "PT / Assessment"],
  assessment: ["私教/评估", "PT / Assessment"],
  annual: ["年卡/组合套餐", "Annual / Package"],
  package: ["年卡/组合套餐", "Annual / Package"],
  workshop: ["工作坊", "Workshops"],
  training: ["培训课", "Training"],
  enterprise: ["企业课", "Corporate"],
  misc: ["杂项", "Miscellaneous"],
};

export const paymentCopy: Record<string, [string, string]> = {
  cash: ["现金", "Cash"], pos: ["POS 通", "POS"], company_qr: ["公司二维码", "Company QR code"], alipay: ["支付宝", "Alipay"], wechat: ["微信", "WeChat Pay"], ar: ["AR account", "AR account"], ent: ["ENT", "ENT"], youzan: ["有赞", "Youzan"], dianping: ["大众点评", "Dianping"], voucher: ["券", "Voucher"], stored_card: ["储值卡", "Stored-value card"], fitness_member: ["健身会员", "Fitness member"], offline_verify: ["到店核销", "In-studio redemption"],
};
export const paymentMethods = Object.keys(paymentCopy);

export function canonicalCategory(value: string) {
  return value === "assessment" ? "private" : value === "package" ? "annual" : value;
}

export function categoryLabel(value: string, local: (zh: string, en?: string) => string) {
  const copy = categoryCopy[value] ?? [value, value];
  return local(copy[0], copy[1]);
}

export function paymentLabel(value: string, local: (zh: string, en?: string) => string) {
  const copy = paymentCopy[value] ?? [value, value];
  return local(copy[0], copy[1]);
}

export function defaultRevenueMode(category: string, validityDays = 30) {
  const canonical = canonicalCategory(category);
  if (canonical === "private") return "none";
  if (canonical === "annual" || validityDays === 365) return "amortized";
  return "immediate";
}

export function entryTypeLabel(row: Pick<Transaction, "cash_basis" | "revenue_mode" | "kind" | "category">, local: (zh: string, en?: string) => string) {
  if (row.kind === "consumption_reversal") return local("营收冲销", "Revenue reversal");
  if (row.revenue_mode === "amortized") return row.cash_basis ? local("流水+营收（每日均摊）", "Cash + daily revenue") : local("营收（每日均摊）", "Daily revenue");
  if (row.revenue_mode === "immediate") return row.cash_basis ? local("流水+营收", "Cash + revenue") : local("营收", "Revenue");
  if (row.revenue_mode === "none" || (canonicalCategory(row.category) === "private" && ["purchase", "upgrade"].includes(row.kind))) return local("流水", "Cash");
  return row.cash_basis ? local("流水+营收", "Cash + revenue") : local("营收", "Revenue");
}
