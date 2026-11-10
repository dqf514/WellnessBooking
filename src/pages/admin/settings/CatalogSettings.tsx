import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Badge, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useViewPreferences, ViewControls } from "@/components/ViewControls";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import type { Meta, Room, Teacher } from "@/types";

type Kind = "rooms" | "teachers";
type CatalogItem = Room | Teacher;
type FormData = Record<string, string | number | boolean>;

export function CatalogSettings() {
  const { local } = useLanguage();
  const [kind, setKind] = useState<Kind>("rooms");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [view, setView] = useViewPreferences("catalog");
  const [floor, setFloor] = useState("");
  const [sort, setSort] = useState("manual");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState<FormData>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const labels = { rooms: local("教室", "Room"), teachers: local("教练", "Instructor") };
  async function load() { try { setMeta(await apiFetch<Meta>("/api/admin/meta")); } catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); } }
  useEffect(() => { void load(); }, []);
  const floors = useMemo(() => Array.from(new Set(meta?.rooms.map((room) => room.floor) ?? [])).sort(), [meta]);
  const items = useMemo(() => {
    if (!meta) return [];
    if (kind === "teachers") return meta.teachers;
    const rooms = meta.rooms.filter((room) => !floor || room.floor === floor);
    return [...rooms].sort((left, right) => sort === "floor" ? `${left.floor}-${left.sort_order}`.localeCompare(`${right.floor}-${right.sort_order}`) : sort === "capacity" ? right.capacity - left.capacity : left.sort_order - right.sort_order || left.id - right.id);
  }, [meta, kind, floor, sort]);

  function openCreate() {
    setEditing(null);
    setForm(kind === "rooms" ? { name: "", name_en: "", capacity: 10, floor: "1F", sort_order: meta?.rooms.length ?? 0, color: "#49796a", active: true } : { name: "", name_en: "", phone: "", gender: "", specialties: "", specialties_en: "", bio: "", bio_en: "", image_url: "", visible: true, active: true });
    setPhoto(null); setPreview(""); setOpen(true); setError("");
  }
  function openEdit(item: CatalogItem) { setEditing(item); setForm({ ...item }); setPhoto(null); setPreview("image_url" in item ? item.image_url : ""); setOpen(true); setError(""); }
  function set(key: string, value: string | number | boolean) { setForm((current) => ({ ...current, [key]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const saved = await apiFetch<Teacher | Room>(editing ? `/api/admin/${kind}/${editing.id}` : `/api/admin/${kind}`, { method: editing ? "PATCH" : "POST", json: form });
      if (kind === "teachers" && photo) { const body = new FormData(); body.append("file", photo); await apiFetch(`/api/admin/teachers/${saved.id}/photo`, { method: "POST", body }); }
      setOpen(false); setMessage(local(`${labels[kind]}资料已保存`, `${labels[kind]} details saved`)); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); }
    finally { setBusy(false); }
  }
  async function moveRoom(room: Room, direction: -1 | 1) {
    if (!meta) return;
    const ordered = [...meta.rooms].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
    const index = ordered.findIndex((item) => item.id === room.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try { await apiFetch("/api/admin/rooms/reorder", { method: "POST", json: { room_ids: ordered.map((item) => item.id) } }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : local("排序失败", "Reorder failed")); }
  }
  if (!meta) return <Spinner/>;
  return <section className="settings-section">
    <div className="settings-action-row"><div className="sub-tabs"><button type="button" className={kind === "rooms" ? "active" : ""} onClick={() => setKind("rooms")}>{local("教室管理", "Room management")}</button><button type="button" className={kind === "teachers" ? "active" : ""} onClick={() => setKind("teachers")}>{local("教练管理", "Instructor management")}</button></div><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={17}/>{local(`新建${labels[kind]}`, `New ${labels[kind]}`)}</button></div>
    <p className="settings-intro">{local("团课与工作坊课程已移至排课中心的课程库；私教价格与次数在卡课产品中维护。", "Group and workshop templates are now in Schedule. PT prices and sessions are managed in card products.")}</p>
    <section className="filter-panel catalog-view-toolbar">{kind === "rooms" && <><Field label={local("楼层筛选", "Floor")}><select value={floor} onChange={(event) => setFloor(event.target.value)}><option value="">{local("全部楼层", "All floors")}</option>{floors.map((item) => <option value={item} key={item}>{item}</option>)}</select></Field><Field label={local("排序方式", "Sort")}><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="manual">{local("自定义顺序", "Custom order")}</option><option value="floor">{local("按楼层", "By floor")}</option><option value="capacity">{local("按容量", "By capacity")}</option></select></Field></>}<span className="filter-summary">{local(`${items.length} 条`, `${items.length} items`)}</span><ViewControls value={view} onChange={setView}/></section>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {view.mode === "cards" ? <div className="catalog-grid responsive-card-grid" style={{ "--view-columns": view.columns } as React.CSSProperties}>{items.map((item) => <article className="panel catalog-card" key={item.id}><header><Badge tone={item.active ? "green" : "neutral"}>{item.active ? local("启用", "Active") : local("停用", "Inactive")}</Badge><button className="text-button" type="button" onClick={() => openEdit(item)}>{local("编辑", "Edit")}</button><RecycleDeleteButton resource={kind} id={item.id} label={item.name} onDeleted={load}/></header>{"specialties" in item && (item.image_url || preview) && <img className="teacher-card-photo" src={item.image_url} alt={local(`${item.name}的照片`, `${item.name_en || item.name} portrait`)}/>}<h2>{local(item.name, item.name_en)}</h2><p>{local(item.name_en, "specialties" in item ? item.specialties_en : item.name_en)}</p>{"capacity" in item && <><span>{item.floor} · {local("容纳", "Capacity")} {item.capacity} {local("人", "people")}</span><div className="room-order-actions"><button className="button button-small button-outline" type="button" disabled={sort !== "manual"} onClick={() => void moveRoom(item, -1)}>↑ {local("前移", "Move up")}</button><button className="button button-small button-outline" type="button" disabled={sort !== "manual"} onClick={() => void moveRoom(item, 1)}>↓ {local("后移", "Move down")}</button></div></>}{"specialties" in item && <><span>{local(item.specialties, item.specialties_en)}</span><small>{item.visible ? local("会员端展示", "Visible to members") : local("会员端隐藏", "Hidden from members")}</small></>}</article>)}</div> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{local("名称", "Name")}</th>{kind === "rooms" ? <><th>{local("楼层", "Floor")}</th><th>{local("容纳人数", "Capacity")}</th><th>{local("顺序", "Order")}</th></> : <><th>{local("擅长课程", "Specialties")}</th><th>{local("手机号", "Mobile")}</th></>}<th>{local("状态", "Status")}</th><th>{local("操作", "Actions")}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{local(item.name, item.name_en)}</strong><small>{item.name_en}</small></td>{"capacity" in item ? <><td>{item.floor}</td><td>{item.capacity}</td><td>{item.sort_order + 1}</td></> : "specialties" in item ? <><td>{local(item.specialties, item.specialties_en)}</td><td>{item.phone || "—"}</td></> : null}<td><Badge tone={item.active ? "green" : "neutral"}>{item.active ? local("启用", "Active") : local("停用", "Inactive")}</Badge></td><td><button className="text-button" type="button" onClick={() => openEdit(item)}>{local("编辑", "Edit")}</button><RecycleDeleteButton resource={kind} id={item.id} label={item.name} onDeleted={load}/></td></tr>)}</tbody></table></ResponsiveTable></section>}
    {open && <Modal wide title={local(`${editing ? "编辑" : "新建"}${labels[kind]}`, `${editing ? "Edit" : "New"} ${labels[kind]}`)} onClose={() => setOpen(false)}><form className="form-grid two-columns" onSubmit={save}><Field label={local("中文名称", "Chinese name")}><input required value={String(form.name ?? "")} onChange={(event) => set("name", event.target.value)}/></Field><Field label={local("英文名称", "English name")}><input value={String(form.name_en ?? "")} onChange={(event) => set("name_en", event.target.value)}/></Field>{kind === "rooms" && <><Field label={local("容纳人数", "Capacity")}><input min={1} type="number" value={Number(form.capacity)} onChange={(event) => set("capacity", Number(event.target.value))}/></Field><Field label={local("楼层", "Floor")}><input required value={String(form.floor ?? "")} placeholder={local("例如 2F", "e.g. 2F")} onChange={(event) => set("floor", event.target.value)}/></Field><Field label={local("标识颜色", "Display color")}><input type="color" value={String(form.color)} onChange={(event) => set("color", event.target.value)}/></Field><Field label={local("排列顺序", "Display order")} hint={local("也可在卡片中直接前移或后移", "Use Move up / down on cards")}><input min={0} type="number" value={Number(form.sort_order)} onChange={(event) => set("sort_order", Number(event.target.value))}/></Field></>}{kind === "teachers" && <><div className="teacher-photo-editor span-two"><div className="teacher-photo-preview">{preview ? <img src={preview} alt={local("教练照片预览", "Instructor portrait preview")}/> : <Icon name="user" size={36}/>}</div><Field label={local("个人照片", "Portrait")} hint={local("支持 PNG、JPG、WebP，不超过 4MB", "PNG, JPG or WebP up to 4MB")}><input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setPhoto(file); if (file) setPreview(URL.createObjectURL(file)); }}/></Field></div><Field label={local("手机号", "Mobile")}><input value={String(form.phone ?? "")} onChange={(event) => set("phone", event.target.value)}/></Field><Field label={local("性别", "Gender")}><select value={String(form.gender ?? "")} onChange={(event) => set("gender", event.target.value)}><option value="">{local("未填写", "Not provided")}</option><option value="女">{local("女", "Female")}</option><option value="男">{local("男", "Male")}</option></select></Field><Field label={local("擅长课程（中文）", "Specialties (Chinese)")}><input value={String(form.specialties ?? "")} onChange={(event) => set("specialties", event.target.value)}/></Field><Field label={local("擅长课程（英文）", "Specialties (English)")}><input value={String(form.specialties_en ?? "")} onChange={(event) => set("specialties_en", event.target.value)}/></Field><Field label={local("个人介绍（中文）", "Bio (Chinese)")} className="span-two"><textarea rows={3} value={String(form.bio ?? "")} onChange={(event) => set("bio", event.target.value)}/></Field><Field label={local("个人介绍（英文）", "Bio (English)")} className="span-two"><textarea rows={3} value={String(form.bio_en ?? "")} onChange={(event) => set("bio_en", event.target.value)}/></Field><Field label={local("照片 URL（也可直接上传）", "Photo URL (or upload above)")} className="span-two"><input value={String(form.image_url ?? "")} onChange={(event) => { set("image_url", event.target.value); setPreview(event.target.value); }}/></Field><label className="checkbox-label span-two"><input type="checkbox" checked={Boolean(form.visible)} onChange={(event) => set("visible", event.target.checked)}/>{local("在会员端展示", "Show on member site")}</label></>}<label className="checkbox-label span-two"><input type="checkbox" checked={Boolean(form.active)} onChange={(event) => set("active", event.target.checked)}/>{local("启用", "Active")}</label><button className="button button-primary button-full span-two" disabled={busy} type="submit">{busy ? local("保存中…", "Saving…") : local(`保存${labels[kind]}资料`, `Save ${labels[kind]} details`)}</button></form></Modal>}
  </section>;
}
