import { useEffect, useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Badge, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import type { Role, User } from "@/types";

export function UsersSettings() {
  const { admin: a, local } = useLanguage();
  const roleLabels: Record<Role, string> = { admin: a("IT / 管理员"), finance: a("财务"), frontdesk: a("前台"), teacher: a("教练（只读）"), viewer: "View Only" };
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("frontdesk");
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() { try { const result = await apiFetch<{ items: User[] }>("/api/admin/users"); setUsers(result.items); } catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  function openCreate() { setEditing(null); setUsername(""); setFullName(""); setPhone(""); setRole("frontdesk"); setActive(true); setPassword(""); setOpen(true); }
  function openEdit(row: User) { setEditing(row); setUsername(row.username); setFullName(row.full_name); setPhone(row.phone); setRole(row.role); setActive(row.active); setPassword(""); setOpen(true); }
  async function save(event: FormEvent) { event.preventDefault(); setError(""); const payload: Record<string, unknown> = { full_name: fullName, phone, role, active }; if (password) payload.password = password; if (!editing) { payload.username = username; payload.password = password; } try { await apiFetch(editing ? `/api/admin/users/${editing.id}` : "/api/admin/users", { method: editing ? "PATCH" : "POST", json: payload }); setOpen(false); setMessage(local(editing ? "账号已更新" : "账号已创建", editing ? "Account updated" : "Account created")); await load(); } catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); } }
  if (loading) return <Spinner/>;
  return <section className="settings-section"><div className="settings-action-row"><p>{a("角色权限在服务端校验；教练与 View Only 可查看业务，但不能修改。")}</p><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={17}/>{a("新建账号")}</button></div>{error && <Notice error message={error}/>} {message && <Notice message={message}/>}<div className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{a("账号")}</th><th>{a("姓名")}</th><th>{a("手机号")}</th><th>{a("角色")}</th><th>{a("状态")}</th><th>{a("操作")}</th></tr></thead><tbody>{users.map((row) => <tr key={row.id}><td><strong>{row.username}</strong></td><td>{row.full_name}</td><td>{row.phone || "—"}</td><td>{roleLabels[row.role]}</td><td><Badge tone={row.active ? "green" : "neutral"}>{row.active ? a("启用") : a("停用")}</Badge></td><td><div className="table-actions"><button className="text-button" type="button" onClick={() => openEdit(row)}>{a("编辑 / 重置密码")}</button><RecycleDeleteButton resource="users" id={row.id} label={row.full_name || row.username} onDeleted={load}/></div></td></tr>)}</tbody></table></ResponsiveTable></div>{open && <Modal title={editing ? a("编辑员工账号") : a("新建员工账号")} onClose={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label={a("登录名")}><input required pattern="[a-z0-9_]{3,30}" readOnly={Boolean(editing)} value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())}/></Field><Field label={a("姓名")}><input required value={fullName} onChange={(event) => setFullName(event.target.value)}/></Field><Field label={a("绑定手机号")} hint={a("用于员工短信验证码登录")}><input value={phone} onChange={(event) => setPhone(event.target.value)}/></Field><Field label={a("角色")}><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label={editing ? a("重置密码（留空不修改）") : a("初始密码（至少 8 位）")}><input required={!editing} minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/></Field><label className="checkbox-label"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)}/>{a("启用账号")}</label><button className="button button-primary button-full" type="submit">{a("保存账号")}</button></form></Modal>}</section>;
}
