import type { Language } from "@/context/LanguageContext";
import type { Transaction } from "@/types";
import { translateAdminMessage } from "./adminMessages";

export function transactionNote(row: Transaction, language: Language): string {
  if (language === "zh") return row.note;
  if (row.note.startsWith("线上申请 ")) return `Online request for ${row.product_name_en || row.product_name || "membership card"}; verify in studio to activate`;
  if (row.note.startsWith("电子码 ")) return `Code ${row.redemption_code || ""} redeemed`.trim();
  const refund = row.note.match(/^退款原单 #(\d+)：(.*)$/);
  if (refund) return `Refund for original entry #${refund[1]}: ${refund[2]}`;
  if (row.product_name && row.note === row.product_name) return row.product_name_en || row.product_name;
  return translateAdminMessage(row.note);
}
