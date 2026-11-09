import { useEffect, useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { Badge, Icon, Modal, Spinner } from "@/components/UI";
import { apiFetch } from "@/lib/api";
import type { Role, User } from "@/types";

const roleLabels: Record<Role, string> = { admin: "IT / 管理员", finance: "财务", frontdesk: "前台", teacher: "教练（只读）", viewer: "View Only" };

export function UsersSettings() {
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
  async function load() { try { const result = await apiFetch<{ items: User[] }>("/api/admin/users"); setUsers(result.items); } catch (err) { setError(err instanceof Error ? err.message : "加载失败"); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  function openCreate() { setEditing(null); setUsername(""); setFullName(""); setPhone(""); setRole("frontdesk"); setActive(true); setPassword(""); setOpen(true); }
  function openEdit(row: User) { setEditing(row); setUsername(row.username); setFullName(row.full_name); setPhone(row.phone); setRole(row.role); setActive(row.active); setPassword(""); setOpen(true); }
  async function save(event: FormEvent) { event.preventDefault(); setError(""); const payload: Record<string, unknown> = { full_name: fullName, phone, role, active }; if (password) payload.password = password; if (!editing) { payload.username = username; payload.password = password; } try { await apiFetch(editing ? `/api/admin/users/${editing.id}` : "/api/admin/users", { method: editing ? "PATCH" : "POST", json: payload }); setOpen(false); setMessage(editing ? "账号已更新" : "账号已创建"); await load(); } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); } }
  if (loading) return <Spinner/>;
  return <section className="settings-section"><div className="settings-action-row"><p>角色权限在服务端校验；教练与 View Only 可查看业务，但不能修改。</p><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={17}/>新建账号</button></div>{error && <Notice error message={error}/>} {message && <Notice message={message}/>}<div className="panel table-panel"><div className="responsive-table"><table className="data-table"><thead><tr><th>账号</th><th>姓名</th><th>手机号</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>{users.map((row) => <tr key={row.id}><td><strong>{row.username}</strong></td><td>{row.full_name}</td><td>{row.phone || "—"}</td><td>{roleLabels[row.role]}</td><td><Badge tone={row.active ? "green" : "neutral"}>{row.active ? "启用" : "停用"}</Badge></td><td><button className="text-button" type="button" onClick={() => openEdit(row)}>编辑 / 重置密码</button></td></tr>)}</tbody></table></div></div>{open && <Modal title={editing ? "编辑员工账号" : "新建员工账号"} onClose={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="登录名"><input required pattern="[a-z0-9_]{3,30}" readOnly={Boolean(editing)} value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())}/></Field><Field label="姓名"><input required value={fullName} onChange={(event) => setFullName(event.target.value)}/></Field><Field label="绑定手机号" hint="用于员工短信验证码登录"><input value={phone} onChange={(event) => setPhone(event.target.value)}/></Field><Field label="角色"><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label={editing ? "重置密码（留空不修改）" : "初始密码（至少 8 位）"}><input required={!editing} minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/></Field><label className="checkbox-label"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)}/>启用账号</label><button className="button button-primary button-full" type="submit">保存账号</button></form></Modal>}</section>;
}
