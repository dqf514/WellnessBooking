import { useRef } from "react";
import { useLanguage } from "@/context/LanguageContext";

// 12 个主色系，每个色系 5 档明度，共 60 个小色块（参照 Word 的颜色面板，但更紧凑）。
const anchors = ["#173f35", "#2f6b5b", "#4f8a76", "#7a9b8a", "#b89b5e", "#8c6d4f", "#5f7fa8", "#8a728e", "#b76e65", "#6b7f95", "#a8bfae", "#c2a878"];
const steps = [0.32, 0.16, 0, -0.16, -0.32];

function hexToHsl(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg].map((item) => Math.round((item + m) * 255));
  return `#${rgb.map((item) => item.toString(16).padStart(2, "0")).join("")}`;
}

function shade(hex: string, delta: number) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.min(0.93, Math.max(0.13, l + delta)));
}

// 每一行是一个明度档，每一列是一个色系。
const paletteRows = steps.map((step) => anchors.map((anchor) => shade(anchor, step)));

export function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { local } = useLanguage();
  const pickerRef = useRef<HTMLInputElement>(null);
  // 原生取色器必须由用户手势触发；部分浏览器不支持 showPicker 时退回 click。
  function openCustom() {
    const input = pickerRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      try { input.showPicker(); return; } catch { /* 继续走 click 兜底 */ }
    }
    input.click();
  }
  return <div className="color-picker">
    <div className="color-presets" role="group" aria-label={local("常用颜色", "Preset colors")}>
      {paletteRows.map((row, rowIndex) => row.map((color) => <button key={`${rowIndex}-${color}`} className={value.toLowerCase() === color ? "active" : ""} style={{ "--swatch": color } as React.CSSProperties} type="button" title={color} aria-label={local(`选择颜色 ${color}`, `Select ${color}`)} aria-pressed={value.toLowerCase() === color} onClick={() => onChange(color)}/>))}
    </div>
    <div className="custom-color">
      <button className="custom-color-trigger" type="button" onClick={openCustom} title={local("打开更多颜色", "Open the custom colour picker")} aria-label={local("打开更多颜色", "Open the custom colour picker")}><span style={{ background: value }}/></button>
      <span>{local("更多颜色", "Custom color")}</span>
      <code>{value.toUpperCase()}</code>
      <input ref={pickerRef} type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={local("更多颜色", "Custom color")}/>
    </div>
  </div>;
}
