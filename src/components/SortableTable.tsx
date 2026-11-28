import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface TableSort {
  key: string;
  dir: SortDirection;
  toggle: (column: string) => void;
  marker: (column: string) => string;
}

/**
 * 列表排序：点击表头切换升序/降序，values 提供每一列的取值函数。
 * 中文按拼音排序，数字按数值排序。
 */
export function useTableSort<T>(rows: T[], initialKey: string, values: Record<string, (row: T) => string | number>): TableSort & { sorted: T[] } {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState<SortDirection>("asc");
  function toggle(column: string) {
    if (column === key) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else { setKey(column); setDir("asc"); }
  }
  const sorted = useMemo(() => {
    const accessor = values[key];
    if (!accessor) return rows;
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = accessor(left);
      const b = accessor(right);
      if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
      return String(a).localeCompare(String(b), "zh-Hans-CN") * factor;
    });
  }, [rows, key, dir, values]);
  return { key, dir, toggle, sorted, marker: (column: string) => (column === key ? (dir === "asc" ? "↑" : "↓") : "↕") };
}

/** 可点击排序的表头：点一次升序，再点一次降序。 */
export function SortableTh({ column, label, sort, className = "" }: { column: string; label: string; sort: TableSort; className?: string }) {
  const active = sort.key === column;
  return <th className={className}><button type="button" className={`sort-header ${active ? "active" : ""}`} onClick={() => sort.toggle(column)}>{label}<span className="sort-mark">{sort.marker(column)}</span></button></th>;
}
