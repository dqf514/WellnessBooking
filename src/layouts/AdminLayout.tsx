import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";

const links: Array<{ to: string; label: string; icon: IconName; end?: boolean; roles?: string[] }> = [
  { to: "/admin", label: "经营概览", icon: "home", end: true },
  { to: "/admin/bookings", label: "预约与签到", icon: "check", roles: ["admin", "frontdesk", "teacher", "viewer"] },
  { to: "/admin/schedule", label: "排课中心", icon: "calendar" },
  { to: "/admin/members", label: "会员管理", icon: "users" },
  { to: "/admin/rooms", label: "教室总览", icon: "room" },
  { to: "/admin/products", label: "卡课产品", icon: "card", roles: ["admin", "finance"] },
  { to: "/admin/finance", label: "财务入账", icon: "money", roles: ["admin", "finance"] },
  { to: "/admin/reports", label: "报表分析", icon: "chart" },
  { to: "/admin/settings", label: "系统设置", icon: "settings", roles: ["admin"] },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const roleLabels: Record<string, string> = { admin: "IT / 管理员", finance: "财务", frontdesk: "前台", teacher: "教练 · 只读", viewer: "View Only" };
  return <div className="admin-shell"><aside className={`admin-sidebar ${menuOpen ? "open" : ""}`}><Link to="/admin" className="brand admin-brand"><span className="brand-mark"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M28 6C15 7 8 13 8 23c7 1 15-2 20-17Z"/><path d="M8 29c3-8 8-12 16-17"/></svg></span><span><strong>音昱</strong><small>WELLNESS OS</small></span></Link><nav className="admin-nav">{links.filter((link) => !link.roles || link.roles.includes(user?.role ?? "")).map((link) => <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setMenuOpen(false)}><Icon name={link.icon}/><span>{link.label}</span></NavLink>)}</nav><div className="sidebar-bottom"><Link to="/" className="view-public"><Icon name="arrow" size={17}/>会员预约端</Link><div className="sidebar-user"><span className="user-avatar">{user?.full_name.slice(0, 1)}</span><div><strong>{user?.full_name}</strong><small>{roleLabels[user?.role ?? "viewer"]}</small></div><button className="icon-button" type="button" aria-label="退出登录" onClick={() => { logout(); navigate("/login"); }}><Icon name="logout" size={18}/></button></div></div></aside>{menuOpen && <button className="sidebar-scrim" type="button" aria-label="关闭菜单" onClick={() => setMenuOpen(false)}/>}<div className="admin-main"><header className="admin-mobile-header"><button className="icon-button" type="button" aria-label="打开菜单" onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><strong>音昱 Wellness</strong><Link to="/"><Icon name="home"/></Link></header><main className="admin-content"><Outlet/></main></div></div>;
}
