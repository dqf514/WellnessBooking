import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/AdminUI";
import { RoomScheduleBoard, requestBoardFullscreen } from "@/components/RoomScheduleBoard";
import { Badge, Empty, Icon, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { addDays, money, today } from "@/lib/date";
import type { Booking, Room, Session } from "@/types";

interface Dashboard { today_sessions: number; today_bookings: number; checked_in: number; active_members: number; new_members: number; month_revenue: number; upcoming: Session[]; recent_bookings: Booking[] }
interface RoomReservation { id: number; room_id: number; title: string; reservation_date: string; start_time: string; end_time: string; usage_type: string; notes: string }
interface OverviewRoom extends Room { sessions: Session[]; reservations: RoomReservation[] }
interface TimelineItem { key: string; kind: "session" | "reservation"; start: string; end: string; title: string; sub: string; color: string; badge: string; tone: "green" | "red" | "amber" | "blue"; session?: Session }

const USAGE_TYPES: Record<string, { zh: string; en: string; tone: "amber" | "blue"; color: string }> = {
  internal: { zh: "内部使用", en: "Internal use", tone: "amber", color: "#c9a227" },
  company: { zh: "公司活动", en: "Company event", tone: "blue", color: "#41677a" },
  enterprise: { zh: "企业活动", en: "Corporate event", tone: "blue", color: "#41677a" },
};

export function DashboardPage() {
  const { admin: a, local } = useLanguage();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<OverviewRoom[]>([]);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardDate, setBoardDate] = useState(today());
  const [boardRooms, setBoardRooms] = useState<OverviewRoom[]>([]);
  const hours = Array.from({ length: 16 }, (_, index) => index + 7);

  useEffect(() => { void apiFetch<Dashboard>("/api/admin/dashboard").then(setData).catch((err) => setError(err.message)); }, []);
  // 当天的教室占用（内部使用、公司活动、企业活动）一并计入今日安排。
  useEffect(() => { void apiFetch<{ rooms: OverviewRoom[] }>(`/api/admin/rooms/overview?date=${today()}`).then((result) => setOverview(result.rooms)).catch(() => {}); }, []);
  useEffect(() => { if (!boardOpen) return; void apiFetch<{ rooms: OverviewRoom[] }>(`/api/admin/rooms/overview?date=${boardDate}`).then((result) => setBoardRooms(result.rooms)).catch(() => setBoardRooms([])); }, [boardOpen, boardDate]);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];
    for (const session of data?.upcoming ?? []) items.push({ key: `s-${session.id}`, kind: "session", start: session.start_time, end: session.end_time, title: local(session.course.name, session.course.name_en), sub: `${local(session.teacher.name, session.teacher.name_en)} · ${local(session.room.name, session.room.name_en)}`, color: session.course.color, badge: `${session.booked_count}/${session.capacity} ${a("人")}`, tone: session.available > 0 ? "green" : "red", session });
    for (const room of overview) for (const reservation of room.reservations) {
      const usage = USAGE_TYPES[reservation.usage_type] ?? USAGE_TYPES.internal;
      items.push({ key: `r-${reservation.id}`, kind: "reservation", start: reservation.start_time, end: reservation.end_time, title: reservation.title, sub: `${local(room.name, room.name_en)} · ${reservation.start_time}–${reservation.end_time}`, color: usage.color, badge: local(usage.zh, usage.en), tone: usage.tone });
    }
    return items.sort((left, right) => left.start.localeCompare(right.start) || left.end.localeCompare(right.end));
  }, [data, overview, local, a]);

  if (error) return <div className="notice notice-error">{a(error)}</div>;
  if (!data) return <Spinner/>;
  const cards = [
    { label: a("今日课程"), value: data.today_sessions, suffix: a("节", "classes"), note: a("团课、私教与评估"), icon: "calendar" as const },
    { label: a("今日预约"), value: data.today_bookings, suffix: a("人次"), note: local(`${data.checked_in} 人次已签到`, `${data.checked_in} checked in`), icon: "check" as const },
    { label: a("有效会员"), value: data.active_members, suffix: a("位", "members"), note: local(`本月新增 ${data.new_members} 位`, `${data.new_members} new this month`), icon: "users" as const },
    { label: a("本月确认营收", "Recognized revenue this month"), value: money(data.month_revenue), suffix: "", note: a("年卡按天、私教按消课、团课按购买", "Annual by day, PT by consumption, group on purchase"), icon: "money" as const },
  ];
  return <div className="dashboard-page"><PageHeader eyebrow="TODAY AT YINYU" title={a("今天，从容开始。")} description={a("课程、到店与会员动态，一屏掌握。")} actions={<Link className="button button-primary" to="/admin/bookings"><Icon name="plus" size={18}/>{a("新建预约")}</Link>}/><section className="metric-grid">{cards.map((card) => <article className="metric-card" key={card.label}><div><span>{card.label}</span><Icon name={card.icon}/></div><strong>{card.value}<small>{card.suffix}</small></strong><p>{card.note}</p></article>)}</section><div className="dashboard-columns"><section className="panel"><header className="panel-header"><div><span className="eyebrow">SCHEDULE</span><h2>{a("今日安排", "Today's schedule")}</h2></div><button className="panel-action" type="button" onClick={() => { setBoardOpen(true); requestBoardFullscreen(); }} title={a("打开教室大屏", "Open the room display")}>{a("完整课表")} <Icon name="expand" size={15}/></button></header>{timeline.length === 0 ? <Empty>{a("今天还没有排课")}</Empty> : <div className="today-timeline">{timeline.map((item) => item.kind === "session" ? <Link to="/admin/bookings" className="timeline-row" key={item.key} style={{ "--course-color": item.color } as React.CSSProperties}><time>{item.start}</time><span className="timeline-line"/><div><h3>{item.title}</h3><p>{item.sub}</p></div><Badge tone={item.tone}>{item.badge}</Badge></Link> : <div className="timeline-row reservation" key={item.key} style={{ "--course-color": item.color } as React.CSSProperties}><time>{item.start}</time><span className="timeline-line"/><div><h3>{item.title}</h3><p>{item.sub}</p></div><Badge tone={item.tone}>{item.badge}</Badge></div>)}</div>}</section><section className="panel"><header className="panel-header"><div><span className="eyebrow">LATEST</span><h2>{a("最新预约")}</h2></div><Link to="/admin/members">{a("会员管理")} <Icon name="chevron" size={15}/></Link></header>{data.recent_bookings.length === 0 ? <Empty>{a("暂无预约动态")}</Empty> : <div className="recent-list">{data.recent_bookings.map((booking) => <div key={booking.id}><span className="user-avatar">{booking.member.name.slice(0, 1)}</span><div><strong>{booking.member.name}</strong><p>{local(booking.session?.course.name ?? "", booking.session?.course.name_en)}</p></div><time>{booking.booked_at.slice(5, 16)}</time></div>)}</div>}</section></div><section className="dashboard-note"><Icon name="bell"/><div><strong>{a("到店提醒")}</strong><p>{a("签到时自动开卡并扣减对应权益；私教完成消课后计入教练课时。短信发送结果可在系统设置的发送日志中核对。")}</p></div><Link to="/admin/settings" className="button button-outline">{a("查看发送日志")}</Link></section>{boardOpen && <RoomScheduleBoard rooms={boardRooms} date={boardDate} hours={hours} local={local} onPrev={() => setBoardDate(addDays(boardDate, -1))} onNext={() => setBoardDate(addDays(boardDate, 1))} onClose={() => setBoardOpen(false)}/>}</div>;
}
