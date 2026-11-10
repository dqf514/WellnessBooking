import { useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Badge, Icon, Modal } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/date";
import type { Course, Meta } from "@/types";

interface CourseForm { course_type: string; name: string; name_en: string; description: string; description_en: string; duration_minutes: number; price: number; color: string; image_url: string; active: boolean }
const blank = (type: string): CourseForm => ({ course_type: type === "workshop" ? "workshop" : "group", name: "", name_en: "", description: "", description_en: "", duration_minutes: type === "workshop" ? 120 : 60, price: type === "workshop" ? 680 : 380, color: "#49796a", image_url: "", active: true });

export function CourseLibraryModal({ meta, initialType, onClose, onChanged }: { meta: Meta; initialType: string; onClose: () => void; onChanged: () => Promise<Meta | void> }) {
  const { local } = useLanguage();
  const { user } = useAuth();
  const [type, setType] = useState(initialType === "workshop" ? "workshop" : "group");
  const [editing, setEditing] = useState<Course | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CourseForm>(blank(type));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const courses = meta.courses.filter((course) => course.course_type === type);

  function open(course?: Course) {
    setEditing(course ?? null);
    setForm(course ? { course_type: course.course_type, name: course.name, name_en: course.name_en, description: course.description, description_en: course.description_en, duration_minutes: course.duration_minutes, price: course.price, color: course.color, image_url: course.image_url, active: course.active } : blank(type));
    setFormOpen(true); setError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiFetch(editing ? `/api/admin/courses/${editing.id}` : "/api/admin/courses", { method: editing ? "PATCH" : "POST", json: form }); await onChanged(); setFormOpen(false); }
    catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); }
    finally { setBusy(false); }
  }
  return <>
    <Modal wide title={local("团课与工作坊课程库", "Group class & workshop library")} onClose={onClose}>
      <div className="settings-action-row"><div className="sub-tabs"><button className={type === "group" ? "active" : ""} type="button" onClick={() => setType("group")}>{local("团课", "Group classes")}</button><button className={type === "workshop" ? "active" : ""} type="button" onClick={() => setType("workshop")}>{local("工作坊", "Workshops")}</button></div><button className="button button-primary" type="button" onClick={() => open()}><Icon name="plus" size={16}/>{local("创建课程", "Create class")}</button></div>
      <p className="form-help">{local("在这里维护课种与时长，再回到周课表安排日期、教练和教室。私教价格在卡课产品中管理。", "Manage class templates and duration here, then schedule dates, instructors and rooms. Personal training prices are managed in card products.")}</p>
      <div className="course-library-list">{courses.map((course) => <article key={course.id}><i style={{ background: course.color }}/><div><strong>{local(course.name, course.name_en)}</strong><small>{course.duration_minutes} {local("分钟", "min")} · {money(course.price)}</small></div><Badge tone={course.active ? "green" : "neutral"}>{course.active ? local("启用", "Active") : local("停用", "Inactive")}</Badge><button className="text-button" type="button" onClick={() => open(course)}>{local("编辑", "Edit")}</button>{user?.role === "admin" && <RecycleDeleteButton resource="courses" id={course.id} label={course.name} onDeleted={async () => { await onChanged(); }}/>}</article>)}</div>
    </Modal>
    {formOpen && <Modal wide title={editing ? local("编辑课程", "Edit class") : local("创建课程", "Create class")} onClose={() => setFormOpen(false)}><form className="form-grid two-columns" onSubmit={save}>{error && <div className="span-two"><Notice error message={error}/></div>}<Field label={local("中文名称", "Chinese name")}><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field><Field label={local("英文名称", "English name")}><input value={form.name_en} onChange={(event) => setForm({ ...form, name_en: event.target.value })}/></Field><Field label={local("课程类别", "Class type")}><select value={form.course_type} onChange={(event) => setForm({ ...form, course_type: event.target.value })}><option value="group">{local("团课", "Group")}</option><option value="workshop">{local("工作坊", "Workshop")}</option></select></Field><Field label={local("时长（分钟）", "Duration (minutes)")}><input min={15} step={15} type="number" value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: Number(event.target.value) })}/></Field><Field label={local("单节价格", "Price per class")}><input min={0} step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}/></Field><Field label={local("课表颜色", "Schedule color")}><input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })}/></Field><Field label={local("中文介绍", "Chinese description")} className="span-two"><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></Field><Field label={local("英文介绍", "English description")} className="span-two"><textarea rows={3} value={form.description_en} onChange={(event) => setForm({ ...form, description_en: event.target.value })}/></Field><Field label={local("图片 URL", "Image URL")} className="span-two"><input value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })}/></Field><label className="checkbox-label span-two"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })}/>{local("启用课程", "Active")}</label><button className="button button-primary button-full span-two" disabled={busy} type="submit">{local("保存课程", "Save class")}</button></form></Modal>}
  </>;
}
