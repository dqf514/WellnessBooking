import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { ColorPicker } from "@/components/ColorPicker";
import { PhotoCropper } from "@/components/PhotoCropper";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Badge, Empty, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { SortableTh, useTableSort } from "@/components/SortableTable";
import { useViewPreferences, ViewControls } from "@/components/ViewControls";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/date";
import { useCan } from "@/lib/permissions";
import type { Course } from "@/types";

interface CourseForm { course_type: string; name: string; name_en: string; description: string; description_en: string; duration_minutes: number; price: number; color: string; image_url: string; active: boolean }
const COURSE_TYPES = ["group", "private", "assessment", "workshop", "training", "enterprise"];
const COURSE_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  group: { zh: "团课", en: "Group class" },
  private: { zh: "私教", en: "Personal training" },
  assessment: { zh: "评估", en: "Assessment" },
  workshop: { zh: "工作坊", en: "Workshop" },
  training: { zh: "培训", en: "Training" },
  enterprise: { zh: "企业课", en: "Corporate class" },
};
const blank: CourseForm = { course_type: "group", name: "", name_en: "", description: "", description_en: "", duration_minutes: 60, price: 380, color: "#49796a", image_url: "", active: true };

export function CoursesPage() {
  const { admin: a, local } = useLanguage();
  const canWrite = useCan("catalog.write");
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseType, setCourseType] = useState("");
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [view, setView] = useViewPreferences("courses");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<CourseForm>(blank);
  const [photo, setPhoto] = useState<File | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const previewRef = useRef("");

  function revokePreview() { if (previewRef.current) { URL.revokeObjectURL(previewRef.current); previewRef.current = ""; } }
  useEffect(() => () => revokePreview(), []);
  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (courseType) query.set("course_type", courseType);
      if (keyword.trim()) query.set("q", keyword.trim());
      const result = await apiFetch<{ items: Course[] }>(`/api/admin/courses?${query.toString()}`);
      setCourses(result.items);
    } catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { setLoading(false); }
  }, [courseType, keyword]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);
  const filtered = useMemo(() => courses.filter((course) => !status || (status === "active" ? course.active : !course.active)), [courses, status]);
  // 课程列表支持点击表头排序：名称、类别、时长与价格。
  const courseSortValues = useMemo(() => ({
    name: (course: Course) => course.name,
    type: (course: Course) => course.course_type,
    duration: (course: Course) => course.duration_minutes,
    price: (course: Course) => course.price,
  }), []);
  const courseSort = useTableSort(filtered, "name", courseSortValues);
  const typeLabel = (value: string) => { const item = COURSE_TYPE_LABELS[value]; return item ? local(item.zh, item.en) : value; };

  function openCreate() { setEditing(null); setForm({ ...blank, course_type: courseType || "group" }); setPhoto(null); revokePreview(); setPreview(""); setFormOpen(true); setError(""); }
  function openEdit(course: Course) {
    setEditing(course);
    setForm({ course_type: course.course_type, name: course.name, name_en: course.name_en, description: course.description, description_en: course.description_en, duration_minutes: course.duration_minutes, price: course.price, color: course.color, image_url: course.image_url, active: course.active });
    setPhoto(null); revokePreview(); setPreview(course.image_url); setFormOpen(true); setError("");
  }
  function choosePhoto(file: File | null) {
    if (file) setCropFile(file);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload: Partial<CourseForm> = { ...form };
      if (photo) delete payload.image_url;
      const saved = await apiFetch<Course>(editing ? `/api/admin/courses/${editing.id}` : "/api/admin/courses", { method: editing ? "PATCH" : "POST", json: payload });
      if (photo) { const body = new FormData(); body.append("file", photo); await apiFetch(`/api/admin/courses/${saved.id}/image`, { method: "POST", body }); }
      setFormOpen(false); setMessage(a(editing ? "课程资料已保存" : "课程已创建")); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); }
    finally { setBusy(false); }
  }
  async function removeImage() {
    if (!editing) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/admin/courses/${editing.id}/image`, { method: "DELETE" });
      revokePreview(); setPreview(""); setPhoto(null); setForm({ ...form, image_url: "" });
      setMessage(a("课程图片已移除")); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("移除失败", "Remove failed")); }
    finally { setBusy(false); }
  }

  return <div>
    <PageHeader eyebrow="CLASS LIBRARY" title={a("课程库")} description={a("统一维护团课、私教、评估、工作坊与培训课程；排课时直接选用这里的课种。", "Maintain group, personal training, assessment, workshop and training classes in one place. The weekly schedule picks classes from this library.")} actions={canWrite && <button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={18}/>{a("新建课程")}</button>}/>
    <section className="filter-panel catalog-view-toolbar"><Field label={local("课程类别", "Class type")}><select value={courseType} onChange={(event) => setCourseType(event.target.value)}><option value="">{local("全部类别", "All types")}</option>{COURSE_TYPES.map((value) => <option value={value} key={value}>{typeLabel(value)}</option>)}</select></Field><Field label={local("状态", "Status")}><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{local("全部状态", "All statuses")}</option><option value="active">{local("启用", "Active")}</option><option value="inactive">{local("停用", "Inactive")}</option></select></Field><Field label={local("搜索", "Search")}><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={local("课程名称", "Class name")}/></Field><span className="filter-summary">{local(`${filtered.length} 个课程`, `${filtered.length} classes`)}</span><ViewControls value={view} onChange={setView}/></section>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {loading ? <Spinner/> : view.mode === "cards" ? <section className="catalog-grid responsive-card-grid" style={{ "--view-columns": view.columns } as React.CSSProperties}>{filtered.map((course) => <article className="panel catalog-card" key={course.id}>{course.image_url && <img className="teacher-card-photo" src={course.image_url} alt={local(course.name, course.name_en)}/>}<header><Badge tone={course.active ? "green" : "neutral"}>{course.active ? a("启用") : a("停用")}</Badge><div className="table-actions">{canWrite && <button className="text-button" type="button" onClick={() => openEdit(course)}>{a("编辑")}</button>}{canWrite && <RecycleDeleteButton resource="courses" id={course.id} label={course.name} onDeleted={load}/>}</div></header><span className="eyebrow">{typeLabel(course.course_type)}</span><h2>{local(course.name, course.name_en)}</h2>{course.description && <p>{local(course.description, course.description_en)}</p>}<small>{course.duration_minutes} {local("分钟", "min")} · {money(course.price)}</small></article>)}</section> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><SortableTh column="name" label={a("课程名称")} sort={courseSort}/><SortableTh column="type" label={a("课程类别")} sort={courseSort}/><SortableTh column="duration" label={a("时长（分钟）")} sort={courseSort}/><SortableTh column="price" label={a("单节价格")} sort={courseSort}/><th>{a("状态")}</th><th>{a("操作")}</th></tr></thead><tbody>{courseSort.sorted.map((course) => <tr key={course.id}><td><strong>{local(course.name, course.name_en)}</strong><small>{course.name_en}</small></td><td>{typeLabel(course.course_type)}</td><td>{course.duration_minutes}</td><td>{money(course.price)}</td><td><Badge tone={course.active ? "green" : "neutral"}>{course.active ? a("启用") : a("停用")}</Badge></td><td><div className="table-actions">{canWrite && <button className="text-button" type="button" onClick={() => openEdit(course)}>{a("编辑")}</button>}{canWrite && <RecycleDeleteButton resource="courses" id={course.id} label={course.name} onDeleted={load}/>}</div></td></tr>)}</tbody></table></ResponsiveTable></section>}
    {!loading && filtered.length === 0 && <Empty>{local("暂无课程，请先新建课程", "No classes yet — create one first")}</Empty>}
    {formOpen && <Modal wide title={editing ? a("编辑课程") : a("新建课程")} onClose={() => setFormOpen(false)}><form className="form-grid two-columns" onSubmit={save}>{error && <div className="span-two"><Notice error message={error}/></div>}<Field label={a("中文名称")}><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field><Field label={a("英文名称")}><input value={form.name_en} onChange={(event) => setForm({ ...form, name_en: event.target.value })}/></Field><Field label={a("课程类别")}><select value={form.course_type} onChange={(event) => setForm({ ...form, course_type: event.target.value })}>{COURSE_TYPES.map((value) => <option value={value} key={value}>{typeLabel(value)}</option>)}</select></Field><Field label={a("时长（分钟）")}><input min={15} step={15} type="number" value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: Number(event.target.value) })}/></Field><Field label={a("单节价格")}><input min={0} step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}/></Field><Field label={a("课表颜色")} hint={local("可点选常用色，也可打开更多颜色", "Choose a preset or open the custom color picker")}><ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })}/></Field><Field label={a("中文介绍")} className="span-two"><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></Field><Field label={a("英文介绍")} className="span-two"><textarea rows={3} value={form.description_en} onChange={(event) => setForm({ ...form, description_en: event.target.value })}/></Field><div className="course-image-editor span-two" onPaste={(event) => { const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/")); if (file) choosePhoto(file); }}><div className="course-image-preview">{preview ? <img src={preview} alt={local("课程图片预览", "Class image preview")}/> : <Icon name="plus" size={28}/>}</div><div><strong>{a("课程图片")}</strong><p>{local("从电脑选择 PNG、JPG 或 WebP，不超过 6MB；也可直接粘贴图片。", "Choose PNG, JPG or WebP up to 6MB, or paste an image.")}</p><label className="profile-upload"><Icon name="plus"/><span>{local("图片上传", "Upload image")}</span><input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}/></label>{editing?.image_url && <button className="text-button danger" type="button" disabled={busy} onClick={() => void removeImage()}><Icon name="close" size={14}/>{local("移除图片", "Remove image")}</button>}</div></div><label className="checkbox-label span-two"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })}/>{a("启用课程")}</label><button className="button button-primary button-full span-two" disabled={busy} type="submit">{busy ? a("保存中…") : a("保存课程资料")}</button></form></Modal>}
    {cropFile && <PhotoCropper file={cropFile} allowOriginal onConfirm={(file) => { setCropFile(null); setPhoto(file); revokePreview(); const url = URL.createObjectURL(file); previewRef.current = url; setPreview(url); }} onCancel={() => setCropFile(null)}/>}
  </div>;
}
