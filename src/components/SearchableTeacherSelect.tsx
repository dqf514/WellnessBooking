import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import type { Teacher } from "@/types";

/** 教练选择：教练多的时候可以输入姓名、擅长课程或手机号快速筛选。 */
export function SearchableTeacherSelect({ teachers, value, onChange }: { teachers: Teacher[]; value: string; onChange: (value: string) => void }) {
  const { local } = useLanguage();
  const selected = teachers.find((teacher) => String(teacher.id) === value);
  const label = (teacher?: Teacher) => teacher ? `${local(teacher.name, teacher.name_en)}${teacher.specialties ? ` · ${local(teacher.specialties, teacher.specialties_en)}` : ""}` : "";
  const [query, setQuery] = useState(label(selected));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => { if (!open) setQuery(label(selected)); }, [value, selected?.id, selected?.name]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return teachers;
    return teachers.filter((teacher) => `${teacher.name} ${teacher.name_en} ${teacher.specialties} ${teacher.specialties_en} ${teacher.phone}`.toLocaleLowerCase().includes(term));
  }, [teachers, query]);
  function choose(teacher: Teacher) {
    onChange(String(teacher.id)); setQuery(label(teacher)); setOpen(false); setActive(0);
  }
  return <div className="searchable-select">
    <input role="combobox" aria-expanded={open} aria-controls="teacher-options" aria-autocomplete="list" required value={query} disabled={!teachers.length} placeholder={local("输入教练姓名或擅长课程搜索", "Search instructor or specialty")} onFocus={(event) => { setOpen(true); setQuery(""); event.target.select(); }} onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(label(selected)); }, 120)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={(event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((current) => Math.min(filtered.length - 1, current + 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
      if (event.key === "Enter" && open && filtered[active]) { event.preventDefault(); choose(filtered[active]); }
      if (event.key === "Escape") { setOpen(false); setQuery(label(selected)); }
    }}/><Icon name="chevron" size={16}/>
    {open && <div className="searchable-options" id="teacher-options" role="listbox">{filtered.slice(0, 80).map((teacher, index) => <button key={teacher.id} className={index === active ? "active" : ""} type="button" role="option" aria-selected={String(teacher.id) === value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(teacher)}><strong>{local(teacher.name, teacher.name_en)}</strong><small>{local(teacher.specialties, teacher.specialties_en) || local("未填写擅长课程", "No specialty listed")}{teacher.phone ? ` · ${teacher.phone}` : ""}</small></button>)}{!filtered.length && <p>{local("没有匹配教练，请更换关键词", "No matching instructors")}</p>}{filtered.length > 80 && <p>{local("匹配结果较多，请继续输入以缩小范围", "Keep typing to narrow the results")}</p>}</div>}
  </div>;
}
