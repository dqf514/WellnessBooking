import { useState } from "react";
import { PageHeader } from "@/components/AdminUI";
import { useLanguage } from "@/context/LanguageContext";
import { GeneralSettings } from "./settings/GeneralSettings";
import { UsersSettings } from "./settings/UsersSettings";
import { SmsSettingsPanel } from "./settings/SmsSettingsPanel";
import { DataSettings } from "./settings/DataSettings";
import { LogsSettings } from "./settings/LogsSettings";
import { ApiKeysSettings } from "./settings/ApiKeysSettings";
import { RecycleBinSettings } from "./settings/RecycleBinSettings";

const tabs = [{ key: "general", label: "场馆与预约" }, { key: "users", label: "账号权限" }, { key: "api-keys", label: "API 密钥" }, { key: "sms", label: "短信通知" }, { key: "data", label: "数据维护" }, { key: "recycle", label: "回收站" }, { key: "logs", label: "操作日志" }];

export function SettingsPage() {
  const { admin: a, local } = useLanguage();
  const [tab, setTab] = useState("general");
  return <div><PageHeader eyebrow="SYSTEM CONTROL" title={a("系统设置")} description={a("场馆资料、基础目录、账号权限、短信与数据安全，仅管理员可修改。")}/><div className="sub-tabs settings-tabs">{tabs.map((item) => <button key={item.key} type="button" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>{item.key === "api-keys" ? local("API 密钥", "API Keys") : a(item.label)}</button>)}</div>{tab === "general" && <GeneralSettings/>}{tab === "users" && <UsersSettings/>}{tab === "api-keys" && <ApiKeysSettings/>}{tab === "sms" && <SmsSettingsPanel/>}{tab === "data" && <DataSettings/>}{tab === "recycle" && <RecycleBinSettings/>}{tab === "logs" && <LogsSettings/>}</div>;
}
