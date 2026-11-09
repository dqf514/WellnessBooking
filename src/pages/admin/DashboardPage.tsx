import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/AdminUI";
import { Badge, Empty, Icon, Spinner } from "@/components/UI";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/date";
import type { Booking, Session } from "@/types";

interface Dashboard { today_sessions: number; today_bookings: number; checked_in: number; active_members: number; new_members: number; month_revenue: number; upcoming: Session[]; recent_bookings: Booking[] }

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void apiFetch<Dashboard>("/api/admin/dashboard").then(setData).catch((err) => setError(err.message)); }, []);
  if (error) return <div className="notice notice-error">{error}</div>;
  if (!data) return <Spinner/>;
  const cards = [
    { label: "今日课程", value: data.today_sessions, suffix: "节", note: "团课、私教与评估", icon: "calendar" as const },
    { label: "今日预约", value: data.today_bookings, suffix: "人次", note: `${data.checked_in} 人次已签到`, icon: "check" as const },
    { label: "有效会员", value: data.active_members, suffix: "位", note: `本月新增 ${data.new_members} 位`, icon: "users" as const },
    { label: "本月实收", value: money(data.month_revenue), suffix: "", note: "购买与手动入账，扣除退款", icon: "money" as const },
  ];
  return <div className="dashboard-page"><PageHeader eyebrow="TODAY AT YINYU" title="今天，从容开始。" description="课程、到店与会员动态，一屏掌握。" actions={<Link className="button button-primary" to="/admin/bookings"><Icon name="plus" size={18}/>新建预约</Link>}/><section className="metric-grid">{cards.map((card) => <article className="metric-card" key={card.label}><div><span>{card.label}</span><Icon name={card.icon}/></div><strong>{card.value}<small>{card.suffix}</small></strong><p>{card.note}</p></article>)}</section><div className="dashboard-columns"><section className="panel"><header className="panel-header"><div><span className="eyebrow">SCHEDULE</span><h2>今日课程</h2></div><Link to="/admin/schedule">完整课表 <Icon name="chevron" size={15}/></Link></header>{data.upcoming.length === 0 ? <Empty>今天还没有排课</Empty> : <div className="today-timeline">{data.upcoming.map((session) => <Link to="/admin/bookings" className="timeline-row" key={session.id} style={{ "--course-color": session.course.color } as React.CSSProperties}><time>{session.start_time}</time><span className="timeline-line"/><div><h3>{session.course.name}</h3><p>{session.teacher.name} · {session.room.name}</p></div><Badge tone={session.available > 0 ? "green" : "red"}>{session.booked_count}/{session.capacity} 人</Badge></Link>)}</div>}</section><section className="panel"><header className="panel-header"><div><span className="eyebrow">LATEST</span><h2>最新预约</h2></div><Link to="/admin/members">会员管理 <Icon name="chevron" size={15}/></Link></header>{data.recent_bookings.length === 0 ? <Empty>暂无预约动态</Empty> : <div className="recent-list">{data.recent_bookings.map((booking) => <div key={booking.id}><span className="user-avatar">{booking.member.name.slice(0, 1)}</span><div><strong>{booking.member.name}</strong><p>{booking.session?.course.name}</p></div><time>{booking.booked_at.slice(5, 16)}</time></div>)}</div>}</section></div><section className="dashboard-note"><Icon name="bell"/><div><strong>到店提醒</strong><p>签到时自动开卡并扣减对应权益；私教完成消课后计入教练课时。短信发送结果可在系统设置的发送日志中核对。</p></div><Link to="/admin/settings" className="button button-outline">查看发送日志</Link></section></div>;
}
