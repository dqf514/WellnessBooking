import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { money } from "@/lib/date";
import { canonicalCategory, categoryLabel } from "@/lib/financeCopy";
import type { Product } from "@/types";

// 购卡时的产品分组：团课产品、私教评估产品、年卡与组合套餐、其他。
const GROUP_ORDER = ["group", "private", "annual", "workshop", "training"];

/** 卡课产品选择：可输入检索，并按类别分组显示，组内按后台自定义顺序排列。 */
export function SearchableProductSelect({ products, value, onChange }: { products: Product[]; value: string; onChange: (value: string) => void }) {
  const { local } = useLanguage();
  const selected = products.find((product) => String(product.id) === value);
  const label = (product?: Product) => product ? `${local(product.name, product.name_en)} · ${money(product.price)}` : "";
  const [query, setQuery] = useState(label(selected));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => { if (!open) setQuery(label(selected)); }, [value, selected?.id, selected?.name]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return products;
    return products.filter((product) => `${product.name} ${product.name_en} ${product.description}`.toLocaleLowerCase().includes(term));
  }, [products, query]);
  const groups = useMemo(() => {
    const buckets = new Map<string, Product[]>();
    for (const product of filtered) {
      const key = canonicalCategory(product.category);
      buckets.set(key, [...(buckets.get(key) ?? []), product]);
    }
    return [...buckets.entries()].sort((left, right) => {
      const leftIndex = GROUP_ORDER.indexOf(left[0]);
      const rightIndex = GROUP_ORDER.indexOf(right[0]);
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
    });
  }, [filtered]);
  const flat = useMemo(() => groups.flatMap(([, items]) => items), [groups]);
  function choose(product: Product) {
    onChange(String(product.id)); setQuery(label(product)); setOpen(false); setActive(0);
  }
  return <div className="searchable-select">
    <input role="combobox" aria-expanded={open} aria-controls="product-options" aria-autocomplete="list" required value={query} disabled={!products.length} placeholder={local("输入产品名称检索", "Search product name")} onFocus={(event) => { setOpen(true); setQuery(""); event.target.select(); }} onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(label(selected)); }, 120)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={(event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((current) => Math.min(flat.length - 1, current + 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
      if (event.key === "Enter" && open && flat[active]) { event.preventDefault(); choose(flat[active]); }
      if (event.key === "Escape") { setOpen(false); setQuery(label(selected)); }
    }}/><Icon name="chevron" size={16}/>
    {open && <div className="searchable-options product-options" id="product-options" role="listbox">{groups.map(([group, items]) => <div className="searchable-group" key={group}><span className="searchable-group-title">{categoryLabel(group, local)}</span>{items.map((product) => { const index = flat.indexOf(product); return <button key={product.id} className={index === active ? "active" : ""} type="button" role="option" aria-selected={String(product.id) === value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(product)}><strong>{local(product.name, product.name_en)}</strong><small>{money(product.price)} · {local(`${product.validity_days} 天`, `${product.validity_days} days`)}{product.total_sessions ? ` · ${product.total_sessions} ${local("次", "sessions")}` : ""}</small></button>; })}</div>)}{!filtered.length && <p>{local("没有匹配产品，请更换关键词", "No matching products")}</p>}</div>}
  </div>;
}
