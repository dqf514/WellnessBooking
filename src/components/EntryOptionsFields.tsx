import { Field } from "@/components/AdminUI";
import { useLanguage } from "@/context/LanguageContext";

interface EntryOptionsProps {
  recordCash: boolean;
  revenueMode: string;
  revenueStartOn: string;
  revenueDays: number;
  onRecordCashChange: (value: boolean) => void;
  onRevenueModeChange: (value: string) => void;
  onRevenueStartOnChange: (value: string) => void;
  onRevenueDaysChange: (value: number) => void;
  privatePurchase?: boolean;
}

export function EntryOptionsFields({ recordCash, revenueMode, revenueStartOn, revenueDays, onRecordCashChange, onRevenueModeChange, onRevenueStartOnChange, onRevenueDaysChange, privatePurchase = false }: EntryOptionsProps) {
  const { local } = useLanguage();
  return <div className="entry-options span-two">
    <div className="entry-options-heading"><strong>{local("入账方式", "Entry treatment")}</strong><span>{privatePurchase ? local("私教/评估须在消课后确认营收", "PT / assessment revenue is recognized after consumption") : local("流水与营收可分别选择；两种营收方式不可同时选择", "Cash and revenue are independent; choose at most one revenue method")}</span></div>
    <div className="entry-option-grid">
      <label className={recordCash ? "selected" : ""}><input type="checkbox" checked={recordCash} disabled={privatePurchase} onChange={(event) => onRecordCashChange(event.target.checked)}/><span><strong>{local("入流水", "Cash ledger")}</strong><small>{local("计入现金实收", "Included in cash received")}</small></span></label>
      <label className={revenueMode === "immediate" ? "selected" : ""}><input type="checkbox" checked={revenueMode === "immediate"} disabled={privatePurchase} onChange={(event) => onRevenueModeChange(event.target.checked ? "immediate" : "none")}/><span><strong>{local("入营收", "Recognize revenue")}</strong><small>{local("本次全额确认营收", "Recognize in full now")}</small></span></label>
      <label className={revenueMode === "amortized" ? "selected" : ""}><input type="checkbox" checked={revenueMode === "amortized"} disabled={privatePurchase} onChange={(event) => onRevenueModeChange(event.target.checked ? "amortized" : "none")}/><span><strong>{local("营收每日均摊", "Daily amortization")}</strong><small>{local("按开始日期和天数分摊", "Allocate over the selected days")}</small></span></label>
    </div>
    {revenueMode === "amortized" && <div className="form-grid two-columns revenue-period-fields"><Field label={local("均摊开始日期", "Amortization start")}><input required type="date" value={revenueStartOn} onChange={(event) => onRevenueStartOnChange(event.target.value)}/></Field><Field label={local("均摊天数", "Amortization days")}><input required min={1} max={3650} type="number" value={revenueDays} onChange={(event) => onRevenueDaysChange(Number(event.target.value))}/></Field></div>}
    {!recordCash && revenueMode === "none" && <p className="field-error" role="alert">{local("入流水和入营收至少需要选择一项", "Select cash ledger or a revenue method")}</p>}
  </div>;
}
