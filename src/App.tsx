import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { AdminLayout } from "@/layouts/AdminLayout";
import { LoginPage } from "@/pages/LoginPage";
import { PublicHome } from "@/pages/PublicHome";
import { DashboardPage } from "@/pages/admin/DashboardPage";
import { BookingsPage } from "@/pages/admin/BookingsPage";
import { SchedulePage } from "@/pages/admin/SchedulePage";
import { MembersPage } from "@/pages/admin/MembersPage";
import { RoomsPage } from "@/pages/admin/RoomsPage";
import { ProductsPage } from "@/pages/admin/ProductsPage";
import { FinancePage } from "@/pages/admin/FinancePage";
import { ReportsPage } from "@/pages/admin/ReportsPage";
import { SettingsPage } from "@/pages/admin/SettingsPage";
import { ResourceManagementPage } from "@/pages/admin/ResourceManagementPage";
import { CoursesPage } from "@/pages/admin/CoursesPage";
import { Empty, Spinner } from "@/components/UI";
import { hasAnyCapability, type Capability } from "@/lib/permissions";

// 路由守卫按“能力”判断：菜单可见性与页面可达性使用同一套权限矩阵。
function Protected({ children, capability }: { children: ReactNode; capability?: Capability | Capability[] }) {
  const { user, loading } = useAuth();
  const { local } = useLanguage();
  const location = useLocation();
  if (loading) return <Spinner/>;
  if (!user) return <Navigate to="/login" replace/>;
  if (capability && !hasAnyCapability(user.role, capability, user.capabilities)) {
    // 概览页本身也无权访问时给出提示，避免反复跳回同一路由形成死循环。
    if (location.pathname === "/admin") return <div className="panel table-panel"><Empty>{local("当前账号没有任何可访问的后台页面，请联系管理员调整权限。", "This account cannot access any admin page. Ask an administrator to adjust its permissions.")}</Empty></div>;
    return <Navigate to="/admin" replace/>;
  }
  return children;
}

export default function App() {
  return <Routes><Route path="/" element={<PublicHome/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/admin" element={<Protected><AdminLayout/></Protected>}><Route index element={<Protected capability="dashboard.view"><DashboardPage/></Protected>}/><Route path="bookings" element={<Navigate to="group" replace/>}/><Route path="bookings/:type" element={<Protected capability="bookings.view"><BookingsPage/></Protected>}/><Route path="schedule" element={<Navigate to="group" replace/>}/><Route path="schedule/private" element={<Navigate to="/admin/bookings/private" replace/>}/><Route path="schedule/:type" element={<Protected capability="bookings.view"><SchedulePage/></Protected>}/><Route path="members" element={<Protected capability="members.view"><MembersPage/></Protected>}/><Route path="rooms" element={<Protected capability="catalog.view"><RoomsPage/></Protected>}/><Route path="resources/courses" element={<Protected capability="catalog.view"><CoursesPage/></Protected>}/><Route path="resources/rooms" element={<Protected capability="catalog.write"><ResourceManagementPage kind="rooms"/></Protected>}/><Route path="resources/teachers" element={<Protected capability="catalog.write"><ResourceManagementPage kind="teachers"/></Protected>}/><Route path="products" element={<Protected capability="products.view"><ProductsPage/></Protected>}/><Route path="finance" element={<Protected capability={["finance.view", "revenue.write"]}><FinancePage/></Protected>}/><Route path="reports" element={<Protected capability="reports.view"><ReportsPage/></Protected>}/><Route path="settings" element={<Protected capability="settings.view"><SettingsPage/></Protected>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;
}
