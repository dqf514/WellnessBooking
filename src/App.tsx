import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
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
import { Spinner } from "@/components/UI";

function Protected({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner/>;
  if (!user) return <Navigate to="/login" replace/>;
  if (roles && !roles.includes(user.role)) return <Navigate to="/admin" replace/>;
  return children;
}

export default function App() {
  return <Routes><Route path="/" element={<PublicHome/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/admin" element={<Protected><AdminLayout/></Protected>}><Route index element={<DashboardPage/>}/><Route path="bookings" element={<Navigate to="group" replace/>}/><Route path="bookings/:type" element={<BookingsPage/>}/><Route path="schedule" element={<Navigate to="group" replace/>}/><Route path="schedule/:type" element={<SchedulePage/>}/><Route path="members" element={<MembersPage/>}/><Route path="rooms" element={<RoomsPage/>}/><Route path="products" element={<Protected roles={["admin", "finance"]}><ProductsPage/></Protected>}/><Route path="finance" element={<Protected roles={["admin", "finance"]}><FinancePage/></Protected>}/><Route path="reports" element={<ReportsPage/>}/><Route path="settings" element={<Protected roles={["admin"]}><SettingsPage/></Protected>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;
}
