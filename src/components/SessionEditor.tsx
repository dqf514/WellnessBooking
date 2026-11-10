import { useEffect, useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { Modal } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { today } from "@/lib/date";
import type { Meta, Room, Session } from "@/types";

interface SessionForm { course_id: string; teacher_id: string; room_id: string; session_date: string; start_time: string; end_time: string; capacity: string; notes: string }
interface RoomConflict { kind: "class" | "reservation"; title: string; title_en: string; teacher_name: string; teacher_name_en: string; start_time: string; end_time: string }
interface RoomAvailability extends Room { available: boolean; conflicts: RoomConflict[] }

export interface SessionEditorInitial { course_id?: string; teacher_id?: string; room_id?: string; session_date?: string; start_time?: string; end_time?: string; capacity?: string; notes?: string }

function endFor(start: string, duration: number) {
  const [hour, minute] = start.split(":").map(Number);
  const total = hour * 60 + minute + duration;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function SessionEditor({ meta, session, initial = {}, courseType = "", onClose, onSaved }: { meta: Meta; session?: Session | null; initial?: SessionEditorInitial; courseType?: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { local } = useLanguage();
  const types = courseType === "private" ? ["private", "assessment"] : courseType ? [courseType] : [];
  const courses = meta.courses.filter((item) => item.active && (!types.length || types.includes(item.course_type)));
  const initialCourse = session?.course ?? courses.find((item) => String(item.id) === initial.course_id) ?? courses[0];
  const [form, setForm] = useState<SessionForm>({
    course_id: String(session?.course_id ?? initialCourse?.id ?? ""),
    teacher_id: String(session?.teacher_id ?? initial.teacher_id ?? meta.teachers.find((item) => item.active)?.id ?? ""),
    room_id: String(session?.room_id ?? initial.room_id ?? meta.rooms.find((item) => item.active)?.id ?? ""),
    session_date: session?.session_date ?? initial.session_date ?? today(),
    start_time: session?.start_time ?? initial.start_time ?? "09:00",
    end_time: session?.end_time ?? initial.end_time ?? (initialCourse ? endFor(initial.start_time ?? "09:00", initialCourse.duration_minutes) : "10:00"),
    capacity: String(session?.capacity ?? initial.capacity ?? (courseType === "private" ? "1" : "10")),
    notes: session?.notes ?? initial.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [availability, setAvailability] = useState<Record<number, RoomAvailability>>({});
  const [checkingRooms, setCheckingRooms] = useState(false);
  const [roomError, setRoomError] = useState("");

  useEffect(() => {
    let active = true;
    if (!form.session_date || !form.start_time || !form.end_time) return undefined;
    setCheckingRooms(true); setRoomError("");
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ date: form.session_date, start_time: form.start_time, end_time: form.end_time, exclude_session_id: String(session?.id ?? 0) });
        const result = await apiFetch<{ rooms: RoomAvailability[] }>(`/api/admin/rooms/availability?${query}`);
        if (active) setAvailability(Object.fromEntries(result.rooms.map((room) => [room.id, room])));
      } catch (err) {
        if (active) { setAvailability({}); setRoomError(err instanceof Error ? err.message : local("教室占用检查失败", "Room availability check failed")); }
      } finally { if (active) setCheckingRooms(false); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [form.session_date, form.start_time, form.end_time, session?.id]);

  const selectedConflicts = availability[Number(form.room_id)]?.conflicts ?? [];
  function conflictText(conflict: RoomConflict) {
    return `${conflict.start_time}–${conflict.end_time} ${local(conflict.title, conflict.title_en)}${conflict.teacher_name ? ` · ${local(conflict.teacher_name, conflict.teacher_name_en)}` : ""}`;
  }
  const roomHint = checkingRooms ? local("正在检查教室占用…", "Checking room availability…") : selectedConflicts.length ? local(`当前教室冲突：${conflictText(selectedConflicts[0])}`, `Selected room conflict: ${conflictText(selectedConflicts[0])}`) : local("冲突教室已禁用，并标注对应课程或占用", "Conflicting rooms are disabled with class or reservation details");

  function update(key: keyof SessionForm, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "course_id" || key === "start_time") {
        const course = meta.courses.find((item) => item.id === Number(next.course_id));
        if (course) {
          next.end_time = endFor(next.start_time, course.duration_minutes);
          if (["private", "assessment"].includes(course.course_type)) next.capacity = "1";
        }
      }
      return next;
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (selectedConflicts.length) { setError(local(`当前教室与 ${conflictText(selectedConflicts[0])} 冲突，请选择其他教室`, `The selected room conflicts with ${conflictText(selectedConflicts[0])}. Choose another room.`)); return; }
    setBusy(true); setError("");
    const payload = { ...form, course_id: Number(form.course_id), teacher_id: Number(form.teacher_id), room_id: Number(form.room_id), capacity: Number(form.capacity) };
    try {
      await apiFetch(session ? `/api/admin/sessions/${session.id}` : "/api/admin/sessions", { method: session ? "PATCH" : "POST", json: payload });
      await onSaved(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!session) return;
    setBusy(true); setError("");
    try {
      await apiFetch(confirm === "delete" ? `/api/admin/sessions/${session.id}/permanent` : `/api/admin/sessions/${session.id}`, { method: "DELETE" });
      await onSaved(); setConfirm(null); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : local("操作失败", "Action failed")); setConfirm(null); }
    finally { setBusy(false); }
  }

  return <>
    <Modal wide title={session ? local("编辑排课", "Edit class") : local("新建排课", "Schedule class")} onClose={onClose}>
      <form className="form-grid two-columns" onSubmit={save}>
        {(error || roomError) && <div className="span-two"><Notice error message={error || roomError}/></div>}
        <Field label={local("课程 / 服务", "Class / service")}><select required value={form.course_id} onChange={(event) => update("course_id", event.target.value)}>{courses.map((course) => <option key={course.id} value={course.id}>{local(course.name, course.name_en)} · {local(course.course_type === "group" ? "团课" : course.course_type === "private" ? "私教" : course.course_type === "workshop" ? "工作坊" : "评估", course.course_type)}</option>)}</select></Field>
        <Field label={local("上课日期", "Class date")}><input required type="date" value={form.session_date} onChange={(event) => update("session_date", event.target.value)}/></Field>
        <Field label={local("开始时间", "Start time")}><input required type="time" step={900} value={form.start_time} onChange={(event) => update("start_time", event.target.value)}/></Field>
        <Field label={local("结束时间", "End time")} hint={local("按课程时长自动带出，可手动调整", "Based on class duration; editable")}><input required type="time" step={900} value={form.end_time} onChange={(event) => update("end_time", event.target.value)}/></Field>
        <Field label={local("教练", "Instructor")}><select required value={form.teacher_id} onChange={(event) => update("teacher_id", event.target.value)}>{meta.teachers.filter((item) => item.active).map((teacher) => <option key={teacher.id} value={teacher.id}>{local(teacher.name, teacher.name_en)}</option>)}</select></Field>
        <Field label={local("教室", "Room")} hint={roomHint}><select required value={form.room_id} onChange={(event) => update("room_id", event.target.value)}>{meta.rooms.filter((item) => item.active).map((room) => { const conflicts = availability[room.id]?.conflicts ?? []; return <option key={room.id} value={room.id} disabled={conflicts.length > 0}>{local(room.name, room.name_en)} · {room.floor}{conflicts.length ? ` · ${local("冲突", "Conflict")}: ${conflicts.map(conflictText).join(local("；", "; "))}` : ""}</option>; })}</select></Field>
        <Field label={local("最大人数", "Capacity")}><input required min={1} type="number" value={form.capacity} readOnly={courseType === "private"} onChange={(event) => update("capacity", event.target.value)}/></Field>
        <Field label={local("备注", "Notes")}><input value={form.notes} onChange={(event) => update("notes", event.target.value)}/></Field>
        <div className="form-footer span-two">
          {session && <><button className="button button-danger-ghost" type="button" disabled={busy} onClick={() => setConfirm("cancel")}>{local("取消课程", "Cancel class")}</button><button className="text-button danger" type="button" disabled={busy} onClick={() => setConfirm("delete")}>{local("删除排课", "Delete schedule")}</button></>}
          <span/><button className="button button-outline" type="button" onClick={onClose}>{local("返回", "Back")}</button><button className="button button-primary" disabled={busy || !courses.length} type="submit">{busy ? local("保存中…", "Saving…") : local("保存排课", "Save class")}</button>
        </div>
      </form>
    </Modal>
    {confirm && <Modal title={confirm === "delete" ? local("删除排课", "Delete schedule") : local("取消课程", "Cancel class")} onClose={() => setConfirm(null)}><div className="logout-confirmation"><p>{confirm === "delete" ? local("空排课删除后会移入回收站，管理员可恢复；满 180 天后才能彻底删除。已有预约时请使用“取消课程”。", "Empty classes are moved to the recycle bin and can be restored by an administrator. Permanent deletion is available only after 180 days. Cancel classes with bookings to preserve their history.") : local("取消后有效预约会一并取消并发送通知，课程和财务历史会保留。", "Active bookings will be cancelled and notified. Class and financial history will be preserved.")}</p><div className="logout-confirmation-actions"><button className="button button-outline" type="button" onClick={() => setConfirm(null)}>{local("返回", "Back")}</button><button className="button button-danger-ghost" disabled={busy} type="button" onClick={() => void remove()}>{local("确认", "Confirm")}</button></div></div></Modal>}
  </>;
}
