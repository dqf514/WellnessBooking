export function isoDate(date: Date) {
  const year = date.getFullYear();
  return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function today() { return isoDate(new Date()); }
export function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}
export function weekStart(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return isoDate(date);
}
export function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
export function weekday(value: string, english = false) {
  const names = english ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return names[new Date(`${value}T12:00:00`).getDay()];
}
export function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
}
export function formatDateTime(value?: string | null) {
  return value ? value.slice(0, 16).replace("T", " ") : "—";
}

/**
 * 按课程时长推算结束时间。跨过午夜时返回空字符串——排课只支持当天时间，
 * 静默折回 01:00 会被服务端判为“结束时间早于开始时间”，不如留空让用户调整。
 */
export function endTimeFor(start: string, durationMinutes: number) {
  const [hour, minute] = start.split(":").map(Number);
  const total = hour * 60 + minute + durationMinutes;
  if (!Number.isFinite(total) || total >= 24 * 60) return "";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** 时间转分钟数，用于比较先后顺序。 */
export function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
