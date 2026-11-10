import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

export interface ViewPreferences { mode: "cards" | "list"; columns: number }

export function useViewPreferences(key: string): [ViewPreferences, (next: ViewPreferences) => void] {
  const { user } = useAuth();
  const storageKey = `wellness_view_${user?.id ?? "guest"}_${key}`;
  const [preferences, setPreferences] = useState<ViewPreferences>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<ViewPreferences> | null;
      return { mode: saved?.mode === "list" ? "list" : "cards", columns: [2, 3, 4, 5].includes(saved?.columns ?? 0) ? Number(saved?.columns) : 3 };
    } catch { return { mode: "cards", columns: 3 }; }
  });
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(preferences)); }, [preferences, storageKey]);
  return [preferences, setPreferences];
}

export function ViewControls({ value, onChange }: { value: ViewPreferences; onChange: (next: ViewPreferences) => void }) {
  const { local } = useLanguage();
  return <div className="view-controls" aria-label={local("视图设置", "View settings")}>
    <div className="view-mode-switch">
      <button type="button" className={value.mode === "cards" ? "active" : ""} aria-pressed={value.mode === "cards"} onClick={() => onChange({ ...value, mode: "cards" })}>{local("卡片", "Cards")}</button>
      <button type="button" className={value.mode === "list" ? "active" : ""} aria-pressed={value.mode === "list"} onClick={() => onChange({ ...value, mode: "list" })}>{local("列表", "List")}</button>
    </div>
    {value.mode === "cards" && <label>{local("每行", "Per row")}<select value={value.columns} onChange={(event) => onChange({ ...value, columns: Number(event.target.value) })}>{[2, 3, 4, 5].map((count) => <option value={count} key={count}>{count}</option>)}</select></label>}
  </div>;
}
