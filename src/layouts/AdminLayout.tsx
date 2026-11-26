import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PersonalProfilePanel } from "@/components/PersonalProfilePanel";
import { Icon, LogoutConfirm, type IconName } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasAnyCapability, type Capability } from "@/lib/permissions";

const SIDEBAR_KEY = "wellness_admin_sidebar_collapsed";

interface NavChild { to: string; label: string; capability: Capability | Capability[] }
interface NavSection { to?: string; label?: string; title?: string; icon: IconName; capability?: Capability | Capability[]; children?: NavChild[] }

// 后台导航：按“从日常到配置”的顺序分组，菜单可见性由服务端下发的能力清单决定。
function navSections(a: (zh: string, en?: string) => string, local: (zh: string, en: string) => string): NavSection[] {
  return [
    { to: "/admin", label: a("经营概览"), icon: "home", capability: "dashboard.view" },
    { title: a("预约与签到"), icon: "check", children: [
      { to: "/admin/bookings/group", label: local("团课预约", "Group bookings"), capability: "bookings.view" },
      { to: "/admin/bookings/private", label: local("私教预约", "PT bookings"), capability: "bookings.view" },
      { to: "/admin/bookings/assessment", label: local("评估预约", "Assessment bookings"), capability: "bookings.view" },
      { to: "/admin/bookings/workshop", label: local("工作坊预约", "Workshop bookings"), capability: "bookings.view" },
    ] },
    { to: "/admin/rooms", label: a("教室总览"), icon: "room", capability: "catalog.view" },
    { title: a("排课中心"), icon: "calendar", children: [
      { to: "/admin/schedule/group", label: local("团课排课", "Group schedule"), capability: "bookings.view" },
      { to: "/admin/schedule/workshop", label: local("工作坊排课", "Workshop schedule"), capability: "bookings.view" },
    ] },
    { to: "/admin/members", label: a("会员管理"), icon: "users", capability: "members.view" },
    { to: "/admin/notices", label: a("会员通知"), icon: "bell", capability: "members.view" },
    { title: a("资源与商品", "Resources & products"), icon: "database", children: [
      { to: "/admin/resources/courses", label: a("课程库"), capability: "catalog.view" },
      { to: "/admin/resources/teachers", label: a("教练管理"), capability: "catalog.write" },
      { to: "/admin/resources/rooms", label: a("教室管理"), capability: "catalog.write" },
      { to: "/admin/products", label: local("卡课产品", "Cards & products"), capability: "products.view" },
    ] },
    { to: "/admin/finance", label: a("财务入账"), icon: "money", capability: ["finance.view", "revenue.write"] },
    { to: "/admin/reports", label: a("报表中心"), icon: "chart", capability: "reports.view" },
    { to: "/admin/settings", label: a("系统设置"), icon: "settings", capability: "settings.view" },
  ];
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { admin: a, local, language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "1");
  const roleLabels: Record<string, string> = { admin: a("IT / 管理员"), finance: a("财务"), frontdesk: a("前台"), teacher: a("教练"), viewer: a("只读", "View only") };
  const languageToggle = <button className="language-toggle admin-language-toggle" type="button" onClick={() => setLanguage(language === "zh" ? "en" : "zh")} aria-label={language === "zh" ? "Switch to English" : "切换为中文"}>{t("language")}</button>;
  const closeMenu = () => setMenuOpen(false);
  function toggleSidebar() {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  }
  function confirmLogout() { logout(); navigate("/login"); }
  const allowed = (capability: Capability | Capability[]) => hasAnyCapability(user?.role, capability, user?.capabilities);
  const sections = navSections(a, local);
  return <div className={`admin-shell ${collapsed ? "collapsed" : ""}`}>
    <aside className={`admin-sidebar ${menuOpen ? "open" : ""}`}><div className="admin-sidebar-head"><Link to="/admin" className="brand admin-brand"><BrandLogo/><span><strong>音昱</strong><small>WELLNESS OS</small></span></Link><button className="sidebar-collapse-btn" type="button" onClick={toggleSidebar} title={collapsed ? a("展开导航栏", "Expand navigation") : a("折叠导航栏", "Collapse navigation")} aria-label={collapsed ? a("展开导航栏", "Expand navigation") : a("折叠导航栏", "Collapse navigation")} aria-expanded={!collapsed}><Icon name="chevron" size={16}/></button></div><nav className="admin-nav" aria-label={a("后台导航", "Staff navigation")}>
      {sections.map((section) => {
        if (section.children) {
          const children = section.children.filter((child) => allowed(child.capability));
          if (!children.length) return null;
          return <div className="admin-nav-group" key={section.title}>
            <div className="admin-nav-heading" title={section.title}><Icon name={section.icon}/><span>{section.title}</span></div>
            <div className="admin-nav-children">{children.map((child) => <NavLink key={child.to} to={child.to} onClick={closeMenu} title={child.label}><span>{child.label}</span></NavLink>)}</div>
          </div>;
        }
        if (!section.to || !section.capability || !allowed(section.capability)) return null;
        return <NavLink key={section.to} to={section.to} end={section.to === "/admin"} onClick={closeMenu} title={section.label}><Icon name={section.icon}/><span>{section.label}</span></NavLink>;
      })}
    </nav><div className="sidebar-bottom"><div className="sidebar-quick"><button className="sidebar-quick-btn" type="button" onClick={() => setLanguage(language === "zh" ? "en" : "zh")} title={language === "zh" ? "English" : "中文"} aria-label={language === "zh" ? "Switch to English" : "切换为中文"}><Icon name="globe" size={17}/></button><a className="sidebar-quick-btn" href="/help.html" target="_blank" rel="noreferrer" title={a("操作指南", "User guide")} aria-label={a("操作指南", "User guide")}><Icon name="book" size={17}/></a><Link className="sidebar-quick-btn" to="/" title={a("会员预约端", "Member site")} aria-label={a("会员预约端", "Member site")}><Icon name="home" size={17}/></Link></div><div className="sidebar-user"><button className="sidebar-profile-trigger" type="button" onClick={() => setProfileOpen(true)} aria-label={a("个人中心", "My profile")} title={a("个人中心", "My profile")}><span className="user-avatar">{user?.full_name?.slice(0, 1)}</span><span className="sidebar-profile-glyph"><Icon name="user" size={17}/></span><div><strong>{user?.full_name}</strong><small>{roleLabels[user?.role ?? "viewer"]}</small></div></button><button className="icon-button" type="button" aria-label={a("退出登录")} onClick={() => setLogoutOpen(true)}><Icon name="logout" size={18}/></button></div></div></aside>
    {menuOpen && <button className="sidebar-scrim" type="button" aria-label={a("关闭菜单")} onClick={closeMenu}/>}
    <div className="admin-main"><header className="admin-mobile-header"><button className="icon-button" type="button" aria-label={a("打开菜单")} onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><strong>音昱 Wellness</strong>{languageToggle}<Link to="/" aria-label={a("会员预约端")}><Icon name="home"/></Link></header><main className="admin-content"><ErrorBoundary title={a("页面出错了", "This page failed to load")}><Outlet/></ErrorBoundary></main></div>
    {logoutOpen && <LogoutConfirm title={a("退出登录")} description={a("退出后需要重新登录，才能进入音昱管理工作台。")} cancelLabel={a("取消")} confirmLabel={a("确认退出")} onClose={() => setLogoutOpen(false)} onConfirm={confirmLogout}/>}
    {profileOpen && <PersonalProfilePanel onClose={() => setProfileOpen(false)}/>}
  </div>;
}
