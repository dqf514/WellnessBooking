import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/AdminUI";
import { Badge, Empty, Icon, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/date";
import type { Booking, Session } from "@/types";

interface Dashboard { today_sessions: number; today_bookings: number; checked_in: number; active_members: number; new_members: number; month_revenue: number; upcoming: Session[]; recent_bookings: Booking[] }

export function DashboardPage() {
  const { admin: a, local } = useLanguage();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void apiFetch<Dashboard>("/api/admin/dashboard").then(setData).catch((err) => setError(err.message)); }, []);
  if (error) return <div className="notice notice-error">{a(error)}</div>;
  if (!data) return <Spinner/>;
  const cards = [
    { label: a("今日课程"), value: data.today_sessions, suffix: a("节", "classes"), note: a("团课、私教与评估"), icon: "calendar" as const },
    { label: a("今日预约"), value: data.today_bookings, suffix: a("人次"), note: local(`${data.checked_in} 人次已签到`, `${data.checked_in} checked in`), icon: "check" as const },
    { label: a("有效会员"), value: data.active_members, suffix: a("位", "members"), note: local(`本月新增 ${data.new_members} 位`, `${data.new_members} new this month`), icon: "users" as const },
    { label: a("本月确认营收", "Recognized revenue this month"), value: money(data.month_revenue), suffix: "", note: a("年卡按天、私教按消课、团课按购买", "Annual by day, PT by consumption, group on purchase"), icon: "money" as const },
  ];
  return <div className="dashboard-page"><PageHeader eyebrow="TODAY AT YINYU" title={a("今天，从容开始。")} description={a("课程、到店与会员动态，一屏掌握。")} actions={<Link className="button button-primary" to="/admin/bookings"><Icon name="plus" size={18}/>{a("新建预约")}</Link>}/><section className="metric-grid">{cards.map((card) => <article className="metric-card" key={card.label}><div><span>{card.label}</span><Icon name={card.icon}/></div><strong>{card.value}<small>{card.suffix}</small></strong><p>{card.note}</p></article>)}</section><div className="dashboard-columns"><section className="panel"><header className="panel-header"><div><span className="eyebrow">SCHEDULE</span><h2>{a("今日课程")}</h2></div><Link to="/admin/schedule">{a("完整课表")} <Icon name="chevron" size={15}/></Link></header>{data.upcoming.length === 0 ? <Empty>{a("今天还没有排课")}</Empty> : <div className="today-timeline">{data.upcoming.map((session) => <Link to="/admin/bookings" className="timeline-row" key={session.id} style={{ "--course-color": session.course.color } as React.CSSProperties}><time>{session.start_time}</time><span className="timeline-line"/><div><h3>{local(session.course.name, session.course.name_en)}</h3><p>{local(session.teacher.name, session.teacher.name_en)} · {local(session.room.name, session.room.name_en)}</p></div><Badge tone={session.available > 0 ? "green" : "red"}>{session.booked_count}/{session.capacity} {a("人")}</Badge></Link>)}</div>}</section><section className="panel"><header className="panel-header"><div><span className="eyebrow">LATEST</span><h2>{a("最新预约")}</h2></div><Link to="/admin/members">{a("会员管理")} <Icon name="chevron" size={15}/></Link></header>{data.recent_bookings.length === 0 ? <Empty>{a("暂无预约动态")}</Empty> : <div className="recent-list">{data.recent_bookings.map((booking) => <div key={booking.id}><span className="user-avatar">{booking.member.name.slice(0, 1)}</span><div><strong>{booking.member.name}</strong><p>{local(booking.session?.course.name ?? "", booking.session?.course.name_en)}</p></div><time>{booking.booked_at.slice(5, 16)}</time></div>)}</div>}</section></div><section className="dashboard-note"><Icon name="bell"/><div><strong>{a("到店提醒")}</strong><p>{a("签到时自动开卡并扣减对应权益；私教完成消课后计入教练课时。短信发送结果可在系统设置的发送日志中核对。")}</p></div><Link to="/admin/settings" className="button button-outline">{a("查看发送日志")}</Link></section></div>;
}
