import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Icon, LogoutConfirm, type IconName } from "@/components/UI";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

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
  const { admin: a, language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const roleLabels: Record<string, string> = { admin: a("IT / 管理员"), finance: a("财务"), frontdesk: a("前台"), teacher: a("教练 · 只读"), viewer: "View Only" };
  const languageToggle = <button className="language-toggle admin-language-toggle" type="button" onClick={() => setLanguage(language === "zh" ? "en" : "zh")} aria-label={language === "zh" ? "Switch to English" : "切换为中文"}>{t("language")}</button>;
  function confirmLogout() {
    logout();
    navigate("/login");
  }
  return <div className="admin-shell"><aside className={`admin-sidebar ${menuOpen ? "open" : ""}`}><Link to="/admin" className="brand admin-brand"><BrandLogo/><span><strong>音昱</strong><small>WELLNESS OS</small></span></Link><nav className="admin-nav" aria-label={a("后台导航", "Staff navigation")}>{links.filter((link) => !link.roles || link.roles.includes(user?.role ?? "")).map((link) => <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setMenuOpen(false)}><Icon name={link.icon}/><span>{a(link.label)}</span></NavLink>)}</nav><div className="sidebar-bottom">{languageToggle}<Link to="/" className="view-public"><Icon name="arrow" size={17}/>{a("会员预约端")}</Link><div className="sidebar-user"><span className="user-avatar">{user?.full_name.slice(0, 1)}</span><div><strong>{user?.full_name}</strong><small>{roleLabels[user?.role ?? "viewer"]}</small></div><button className="icon-button" type="button" aria-label={a("退出登录")} onClick={() => setLogoutOpen(true)}><Icon name="logout" size={18}/></button></div></div></aside>{menuOpen && <button className="sidebar-scrim" type="button" aria-label={a("关闭菜单")} onClick={() => setMenuOpen(false)}/>}<div className="admin-main"><header className="admin-mobile-header"><button className="icon-button" type="button" aria-label={a("打开菜单")} onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><strong>音昱 Wellness</strong>{languageToggle}<Link to="/" aria-label={a("会员预约端")}><Icon name="home"/></Link></header><main className="admin-content"><Outlet/></main></div>{logoutOpen && <LogoutConfirm title={a("退出登录")} description={a("退出后需要重新登录，才能进入音昱管理工作台。")} cancelLabel={a("取消")} confirmLabel={a("确认退出")} onClose={() => setLogoutOpen(false)} onConfirm={confirmLogout}/>}</div>;
}
