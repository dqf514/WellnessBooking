import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { Icon, LogoutConfirm, type IconName } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

interface NavChild { to: string; label: string; roles?: string[] }

function NavGroup({ title, icon, links, onNavigate }: { title: string; icon: IconName; links: NavChild[]; onNavigate: () => void }) {
  const { user } = useAuth();
  const visibleLinks = links.filter((link) => !link.roles || link.roles.includes(user?.role ?? ""));
  if (!visibleLinks.length) return null;
  return <div className="admin-nav-group">
    <div className="admin-nav-heading"><Icon name={icon}/><span>{title}</span></div>
    <div className="admin-nav-children">{visibleLinks.map((link) => <NavLink key={link.to} to={link.to} onClick={onNavigate}><span>{link.label}</span></NavLink>)}</div>
  </div>;
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { admin: a, local, language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const roleLabels: Record<string, string> = { admin: a("IT / 管理员"), finance: a("财务"), frontdesk: a("前台"), teacher: a("教练 · 只读"), viewer: "View Only" };
  const languageToggle = <button className="language-toggle admin-language-toggle" type="button" onClick={() => setLanguage(language === "zh" ? "en" : "zh")} aria-label={language === "zh" ? "Switch to English" : "切换为中文"}>{t("language")}</button>;
  const closeMenu = () => setMenuOpen(false);
  function confirmLogout() { logout(); navigate("/login"); }
  const canFinance = ["admin", "finance"].includes(user?.role ?? "");
  return <div className="admin-shell">
    <aside className={`admin-sidebar ${menuOpen ? "open" : ""}`}><Link to="/admin" className="brand admin-brand"><BrandLogo/><span><strong>音昱</strong><small>WELLNESS OS</small></span></Link><nav className="admin-nav" aria-label={a("后台导航", "Staff navigation")}>
      <NavLink to="/admin" end onClick={closeMenu}><Icon name="home"/><span>{a("经营概览")}</span></NavLink>
      <NavLink to="/admin/rooms" onClick={closeMenu}><Icon name="room"/><span>{a("教室总览")}</span></NavLink>
      <NavGroup title={a("预约与签到")} icon="check" onNavigate={closeMenu} links={[{ to: "/admin/bookings/group", label: local("团课预约", "Group bookings") }, { to: "/admin/bookings/private", label: local("私教预约", "PT bookings") }, { to: "/admin/bookings/workshop", label: local("工作坊预约", "Workshop bookings") }]}/>
      <NavGroup title={a("排课中心")} icon="calendar" onNavigate={closeMenu} links={[{ to: "/admin/schedule/group", label: local("团课排课", "Group schedule") }, { to: "/admin/schedule/private", label: local("私教排课", "PT schedule") }, { to: "/admin/schedule/workshop", label: local("工作坊排课", "Workshop schedule") }]}/>
      <NavLink to="/admin/members" onClick={closeMenu}><Icon name="users"/><span>{a("会员管理")}</span></NavLink>
      <NavGroup title={a("资源管理")} icon="database" onNavigate={closeMenu} links={[{ to: "/admin/products", label: local("卡课产品", "Cards & products"), roles: ["admin", "finance"] }, { to: "/admin/resources/rooms", label: local("教室管理", "Room management"), roles: ["admin"] }, { to: "/admin/resources/teachers", label: local("教练管理", "Instructor management"), roles: ["admin"] }]}/>
      {canFinance && <NavLink to="/admin/finance" onClick={closeMenu}><Icon name="money"/><span>{a("财务入账")}</span></NavLink>}
      <NavLink to="/admin/reports" onClick={closeMenu}><Icon name="chart"/><span>{a("报表分析")}</span></NavLink>
      {user?.role === "admin" && <NavLink to="/admin/settings" onClick={closeMenu}><Icon name="settings"/><span>{a("系统设置")}</span></NavLink>}
    </nav><div className="sidebar-bottom">{languageToggle}<a className="view-public admin-help-link" href="/help.html" target="_blank" rel="noreferrer"><Icon name="book" size={17}/>{a("操作指南", "User guide")}</a><Link to="/" className="view-public"><Icon name="arrow" size={17}/>{a("会员预约端")}</Link><div className="sidebar-user"><span className="user-avatar">{user?.full_name.slice(0, 1)}</span><div><strong>{user?.full_name}</strong><small>{roleLabels[user?.role ?? "viewer"]}</small></div><button className="icon-button" type="button" aria-label={a("退出登录")} onClick={() => setLogoutOpen(true)}><Icon name="logout" size={18}/></button></div></div></aside>
    {menuOpen && <button className="sidebar-scrim" type="button" aria-label={a("关闭菜单")} onClick={closeMenu}/>}
    <div className="admin-main"><header className="admin-mobile-header"><button className="icon-button" type="button" aria-label={a("打开菜单")} onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><strong>音昱 Wellness</strong>{languageToggle}<Link to="/" aria-label={a("会员预约端")}><Icon name="home"/></Link></header><main className="admin-content"><Outlet/></main></div>
    {logoutOpen && <LogoutConfirm title={a("退出登录")} description={a("退出后需要重新登录，才能进入音昱管理工作台。")} cancelLabel={a("取消")} confirmLabel={a("确认退出")} onClose={() => setLogoutOpen(false)} onConfirm={confirmLogout}/>}
  </div>;
}
