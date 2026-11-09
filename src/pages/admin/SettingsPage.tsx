import { useState } from "react";
import { PageHeader } from "@/components/AdminUI";
import { useLanguage } from "@/context/LanguageContext";
import { GeneralSettings } from "./settings/GeneralSettings";
import { CatalogSettings } from "./settings/CatalogSettings";
import { UsersSettings } from "./settings/UsersSettings";
import { SmsSettingsPanel } from "./settings/SmsSettingsPanel";
import { DataSettings } from "./settings/DataSettings";
import { LogsSettings } from "./settings/LogsSettings";

const tabs = [{ key: "general", label: "场馆与预约" }, { key: "catalog", label: "课程 / 教室 / 教练" }, { key: "users", label: "账号权限" }, { key: "sms", label: "短信通知" }, { key: "data", label: "数据维护" }, { key: "logs", label: "操作日志" }];

export function SettingsPage() {
  const { admin: a } = useLanguage();
  const [tab, setTab] = useState("general");
  return <div><PageHeader eyebrow="SYSTEM CONTROL" title={a("系统设置")} description={a("场馆资料、基础目录、账号权限、短信与数据安全，仅管理员可修改。")}/><div className="sub-tabs settings-tabs">{tabs.map((item) => <button key={item.key} type="button" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>{a(item.label)}</button>)}</div>{tab === "general" && <GeneralSettings/>}{tab === "catalog" && <CatalogSettings/>}{tab === "users" && <UsersSettings/>}{tab === "sms" && <SmsSettingsPanel/>}{tab === "data" && <DataSettings/>}{tab === "logs" && <LogsSettings/>}</div>;
}
