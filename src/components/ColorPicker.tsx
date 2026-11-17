import { useLanguage } from "@/context/LanguageContext";

const presets = ["#173f35", "#2f6b5b", "#49796a", "#7a9b8a", "#a8bfae", "#b89b5e", "#d3b878", "#8c6d4f", "#6b7f95", "#8a728e", "#b76e65", "#d7d9d4"];

export function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { local } = useLanguage();
  return <div className="color-picker"><div className="color-presets" role="group" aria-label={local("常用颜色", "Preset colors")}>{presets.map((color) => <button key={color} className={value.toLowerCase() === color ? "active" : ""} style={{ "--swatch": color } as React.CSSProperties} type="button" title={color} aria-label={local(`选择颜色 ${color}`, `Select ${color}`)} aria-pressed={value.toLowerCase() === color} onClick={() => onChange(color)}/>)}</div><label className="custom-color"><input type="color" value={value} onChange={(event) => onChange(event.target.value)}/><span>{local("更多颜色", "Custom color")}</span><code>{value.toUpperCase()}</code></label></div>;
}
