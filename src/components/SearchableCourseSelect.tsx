import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import type { Course } from "@/types";

export function SearchableCourseSelect({ courses, value, onChange }: { courses: Course[]; value: string; onChange: (value: string) => void }) {
  const { local } = useLanguage();
  const selected = courses.find((course) => String(course.id) === value);
  const label = (course?: Course) => course ? `${local(course.name, course.name_en)} · ${local(course.course_type === "group" ? "团课" : course.course_type === "private" ? "私教/评估" : course.course_type === "assessment" ? "私教/评估" : course.course_type === "workshop" ? "工作坊" : "培训课", course.course_type)}` : "";
  const [query, setQuery] = useState(label(selected));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => { if (!open) setQuery(label(selected)); }, [value, selected?.id, selected?.name, selected?.name_en]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return courses;
    return courses.filter((course) => `${course.name} ${course.name_en}`.toLocaleLowerCase().includes(term));
  }, [courses, query]);
  function choose(course: Course) {
    onChange(String(course.id)); setQuery(label(course)); setOpen(false); setActive(0);
  }
  return <div className="searchable-select">
    <input role="combobox" aria-expanded={open} aria-controls="course-options" aria-autocomplete="list" required value={query} disabled={!courses.length} placeholder={local("输入课程名称搜索", "Search class name")} onFocus={(event) => { setOpen(true); setQuery(""); event.target.select(); }} onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(label(selected)); }, 120)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={(event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((current) => Math.min(filtered.length - 1, current + 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
      if (event.key === "Enter" && open && filtered[active]) { event.preventDefault(); choose(filtered[active]); }
      if (event.key === "Escape") { setOpen(false); setQuery(label(selected)); }
    }}/><Icon name="chevron" size={16}/>
    {open && <div className="searchable-options" id="course-options" role="listbox">{filtered.slice(0, 80).map((course, index) => <button key={course.id} className={index === active ? "active" : ""} type="button" role="option" aria-selected={String(course.id) === value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(course)}><strong>{local(course.name, course.name_en)}</strong><small>{local(course.course_type === "group" ? "团课" : course.course_type === "private" ? "私教/评估" : course.course_type === "assessment" ? "私教/评估" : course.course_type === "workshop" ? "工作坊" : "培训课", course.course_type)} · {course.duration_minutes} {local("分钟", "min")}</small></button>)}{!filtered.length && <p>{local("没有匹配课程，请更换关键词", "No matching classes")}</p>}{filtered.length > 80 && <p>{local("匹配结果较多，请继续输入以缩小范围", "Keep typing to narrow the results")}</p>}</div>}
  </div>;
}
