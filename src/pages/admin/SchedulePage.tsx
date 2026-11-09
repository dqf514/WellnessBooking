import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { Badge, Icon, Modal, Spinner } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { addDays, shortDate, today, weekStart, weekday } from "@/lib/date";
import type { Meta, Session } from "@/types";

interface SessionForm { course_id: string; teacher_id: string; room_id: string; session_date: string; start_time: string; end_time: string; capacity: string; notes: string }
const blank: SessionForm = { course_id: "", teacher_id: "", room_id: "", session_date: today(), start_time: "09:00", end_time: "10:00", capacity: "10", notes: "" };

export function SchedulePage() {
  const { user } = useAuth();
  const canWrite = ["admin", "frontdesk"].includes(user?.role ?? "");
  const [week, setWeek] = useState(weekStart(today()));
  const [type, setType] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<SessionForm>(blank);
  const [editing, setEditing] = useState<Session | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [week]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ date_from: week, date_to: addDays(week, 6) });
      if (type) query.set("course_type", type);
      const result = await apiFetch<{ items: Session[] }>(`/api/admin/sessions?${query}`);
      setSessions(result.items);
    } catch (err) { setError(err instanceof Error ? err.message : "加载失败"); }
    finally { setLoading(false); }
  }, [week, type]);
  useEffect(() => { void apiFetch<Meta>("/api/admin/meta").then(setMeta).catch((err) => setError(err.message)); }, []);
  useEffect(() => { void load(); }, [load]);

  function openCreate(day = week) {
    if (!meta) return;
    const course = meta.courses.find((item) => item.course_type === "group" && item.active) ?? meta.courses[0];
    setEditing(null); setForm({ ...blank, course_id: String(course?.id ?? ""), teacher_id: String(meta.teachers[0]?.id ?? ""), room_id: String(meta.rooms[0]?.id ?? ""), session_date: day, end_time: course ? endFor("09:00", course.duration_minutes) : "10:00" }); setFormOpen(true);
  }
  function openEdit(session: Session) {
    setEditing(session); setForm({ course_id: String(session.course_id), teacher_id: String(session.teacher_id), room_id: String(session.room_id), session_date: session.session_date, start_time: session.start_time, end_time: session.end_time, capacity: String(session.capacity), notes: session.notes }); setFormOpen(true);
  }
  function endFor(start: string, duration: number) {
    const [hour, minute] = start.split(":").map(Number);
    const total = hour * 60 + minute + duration;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  function updateForm(key: keyof SessionForm, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "course_id" || key === "start_time") {
        const course = meta?.courses.find((item) => item.id === Number(next.course_id));
        if (course) { next.end_time = endFor(next.start_time, course.duration_minutes); if (key === "course_id" && ["private", "assessment"].includes(course.course_type)) next.capacity = "1"; }
      }
      return next;
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const payload = { ...form, course_id: Number(form.course_id), teacher_id: Number(form.teacher_id), room_id: Number(form.room_id), capacity: Number(form.capacity) };
    try {
      await apiFetch(editing ? `/api/admin/sessions/${editing.id}` : "/api/admin/sessions", { method: editing ? "PATCH" : "POST", json: payload });
      setMessage(editing ? "排课已更新" : "排课已创建"); setFormOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); }
    finally { setBusy(false); }
  }
  async function cancelSession() {
    if (!editing || !window.confirm("取消这节课程？有效预约会一并取消并发送取消通知。")) return;
    setBusy(true);
    try { await apiFetch(`/api/admin/sessions/${editing.id}`, { method: "DELETE" }); setMessage("课程与相关预约已取消"); setFormOpen(false); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "取消失败"); }
    finally { setBusy(false); }
  }
  async function copyWeek() {
    if (!window.confirm(`将 ${addDays(week, -7)} 至 ${addDays(week, -1)} 的课程复制到本周？冲突与重复课程会自动跳过。`)) return;
    setBusy(true); setError("");
    try { const result = await apiFetch<{ created: number; skipped: string[] }>("/api/admin/sessions/copy-week", { method: "POST", json: { week_start: week } }); setMessage(`已复制 ${result.created} 节，跳过 ${result.skipped.length} 节${result.skipped.length ? `：${result.skipped.slice(0, 2).join("；")}` : ""}`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "复制失败"); }
    finally { setBusy(false); }
  }

  return <div><PageHeader eyebrow="WEEKLY PLANNER" title="周课表" description="团课、私教、评估、工作坊与培训统一排课；教室和教练冲突会自动拦截。" actions={canWrite && <><button className="button button-outline" disabled={busy} type="button" onClick={() => void copyWeek()}>复制上周课表</button><button className="button button-primary" type="button" onClick={() => openCreate()}><Icon name="plus" size={18}/>新建排课</button></>}/><section className="schedule-toolbar"><div className="week-switch"><button className="icon-button" type="button" aria-label="上一周" onClick={() => setWeek(addDays(week, -7))}>←</button><strong>{shortDate(week)} — {shortDate(addDays(week, 6))}</strong><button className="icon-button" type="button" aria-label="下一周" onClick={() => setWeek(addDays(week, 7))}>→</button><button className="text-button" type="button" onClick={() => setWeek(weekStart(today()))}>本周</button></div><select aria-label="课程类别" value={type} onChange={(event) => setType(event.target.value)}><option value="">全部课程</option><option value="group">团课</option><option value="private">私教</option><option value="assessment">评估</option><option value="workshop">工作坊</option><option value="training">培训</option></select></section>{error && <Notice error message={error}/>} {message && <Notice message={message}/>} {loading ? <Spinner/> : <div className="week-grid-scroll"><section className="week-grid">{days.map((day) => { const daySessions = sessions.filter((item) => item.session_date === day); return <div className={`week-day ${day === today() ? "today" : ""}`} key={day}><header><span>{weekday(day)}</span><strong>{shortDate(day)}</strong>{day === today() && <Badge tone="green">今天</Badge>}</header><div className="week-day-classes">{daySessions.map((session) => <button type="button" key={session.id} className={`schedule-class ${session.status === "cancelled" ? "cancelled" : ""}`} style={{ "--course-color": session.course.color } as React.CSSProperties} onClick={() => canWrite ? openEdit(session) : undefined}><span>{session.start_time}–{session.end_time}</span><strong>{session.course.name}</strong><small>{session.teacher.name}</small><small>{session.room.name}</small><div><Badge tone={session.available ? "green" : "red"}>{session.booked_count}/{session.capacity}</Badge>{session.status === "cancelled" && <Badge>已取消</Badge>}</div></button>)}{daySessions.length === 0 && <p className="no-class">暂无排课</p>}</div>{canWrite && <button className="add-class-link" type="button" onClick={() => openCreate(day)}><Icon name="plus" size={15}/>添加排课</button>}</div>; })}</section></div>}
    {formOpen && <Modal title={editing ? "编辑排课" : "新建排课"} onClose={() => setFormOpen(false)}><form className="form-grid two-columns" onSubmit={save}><Field label="课程"><select required value={form.course_id} onChange={(event) => updateForm("course_id", event.target.value)}>{meta?.courses.filter((item) => item.active).map((course) => <option key={course.id} value={course.id}>{course.name} · {course.course_type}</option>)}</select></Field><Field label="上课日期"><input required type="date" value={form.session_date} onChange={(event) => updateForm("session_date", event.target.value)}/></Field><Field label="开始时间"><input required type="time" step={900} value={form.start_time} onChange={(event) => updateForm("start_time", event.target.value)}/></Field><Field label="结束时间" hint="按课程时长自动带出，可手动调整"><input required type="time" step={900} value={form.end_time} onChange={(event) => updateForm("end_time", event.target.value)}/></Field><Field label="教练"><select required value={form.teacher_id} onChange={(event) => updateForm("teacher_id", event.target.value)}>{meta?.teachers.filter((item) => item.active).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field><Field label="教室"><select required value={form.room_id} onChange={(event) => updateForm("room_id", event.target.value)}>{meta?.rooms.filter((item) => item.active).map((room) => <option key={room.id} value={room.id}>{room.name} / {room.name_en}</option>)}</select></Field><Field label="最大人数"><input required min={1} type="number" value={form.capacity} onChange={(event) => updateForm("capacity", event.target.value)}/></Field><Field label="备注" className="span-two"><textarea rows={3} value={form.notes} onChange={(event) => updateForm("notes", event.target.value)}/></Field><div className="form-footer span-two">{editing && <button className="button button-danger-ghost" type="button" disabled={busy} onClick={() => void cancelSession()}>取消课程</button>}<span/><button className="button button-outline" type="button" onClick={() => setFormOpen(false)}>返回</button><button className="button button-primary" disabled={busy} type="submit">{busy ? "保存中…" : "保存排课"}</button></div></form></Modal>}
  </div>;
}
