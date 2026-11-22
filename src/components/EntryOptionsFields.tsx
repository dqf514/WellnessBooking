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
  // 传入时营收口径只读显示：口径统一由系统设置决定，前台不再逐单勾选。
  lockedRevenueMode?: string;
}

export function EntryOptionsFields({ recordCash, revenueMode, revenueStartOn, revenueDays, onRecordCashChange, onRevenueModeChange, onRevenueStartOnChange, onRevenueDaysChange, privatePurchase = false, lockedRevenueMode = "" }: EntryOptionsProps) {
  const { local } = useLanguage();
  const locked = Boolean(lockedRevenueMode);
  const effective = locked ? lockedRevenueMode : revenueMode;
  const cashLocked = privatePurchase || effective === "none";
  const policyText = effective === "amortized" ? local("按有效期每日均摊确认营收", "Recognize revenue on a daily amortization") : effective === "none" ? local("本次不入营收，私教/评估在实际消课后确认", "No revenue now; recognized after consumption") : local("购卡时全额确认营收", "Recognize the full amount at purchase");
  return <div className="entry-options span-two">
    <div className="entry-options-heading"><strong>{local("入账方式", "Entry treatment")}</strong><span>{locked ? local("营收口径由系统设置统一决定，如需调整请到「系统设置」修改。", "The revenue policy is set in system settings.") : privatePurchase ? local("私教/评估须在消课后确认营收", "PT / assessment revenue is recognized after consumption") : local("流水与营收可分别选择；两种营收方式不可同时选择", "Cash and revenue are independent; choose at most one revenue method")}</span></div>
    <div className="entry-option-grid">
      <label className={recordCash ? "selected" : ""}><input type="checkbox" checked={recordCash} disabled={cashLocked} onChange={(event) => onRecordCashChange(event.target.checked)}/><span><strong>{local("入流水", "Cash ledger")}</strong><small>{local("计入现金实收", "Included in cash received")}</small></span></label>
      {locked ? <div className="entry-option-locked"><strong>{local("营收口径", "Revenue policy")}</strong><small>{policyText}</small></div> : <><label className={effective === "immediate" ? "selected" : ""}><input type="checkbox" checked={effective === "immediate"} disabled={privatePurchase} onChange={(event) => onRevenueModeChange(event.target.checked ? "immediate" : "none")}/><span><strong>{local("入营收", "Recognize revenue")}</strong><small>{local("本次全额确认营收", "Recognize in full now")}</small></span></label><label className={effective === "amortized" ? "selected" : ""}><input type="checkbox" checked={effective === "amortized"} disabled={privatePurchase} onChange={(event) => onRevenueModeChange(event.target.checked ? "amortized" : "none")}/><span><strong>{local("营收每日均摊", "Daily amortization")}</strong><small>{local("按开始日期和天数分摊", "Allocate over the selected days")}</small></span></label></>}
    </div>
    {!locked && effective === "amortized" && <div className="form-grid two-columns revenue-period-fields"><Field label={local("均摊开始日期", "Amortization start")}><input required type="date" value={revenueStartOn} onChange={(event) => onRevenueStartOnChange(event.target.value)}/></Field><Field label={local("均摊天数", "Amortization days")}><input required min={1} max={3650} type="number" value={revenueDays} onChange={(event) => onRevenueDaysChange(Number(event.target.value))}/></Field></div>}
    {!recordCash && effective === "none" && <p className="field-error" role="alert">{local("入流水和入营收至少需要选择一项", "Select cash ledger or a revenue method")}</p>}
  </div>;
}
