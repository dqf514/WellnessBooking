import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Empty, Icon, Modal, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile, getToken } from "@/lib/api";
import { addDays, isoDate, money, shortDate, today, weekday, weekStart } from "@/lib/date";
import type { Booking, Bootstrap, CourseType, MemberMe, Product, Session } from "@/types";

const types: Array<CourseType | "all"> = ["all", "group", "private", "assessment", "workshop", "training"];
type ScheduleView = "day" | "week" | "month";
type SeatStatus = "available" | "limited" | "full";

function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }
function monthEnd(value: string) {
  const date = new Date(`${monthStart(value)}T12:00:00`);
  date.setMonth(date.getMonth() + 1, 0);
  return isoDate(date);
}
function shiftMonth(value: string, amount: number) {
  const date = new Date(`${monthStart(value)}T12:00:00`);
  date.setMonth(date.getMonth() + amount);
  return isoDate(date);
}
function seatStatus(session: Session): SeatStatus {
  if (session.available <= 0) return "full";
  return session.available <= Math.max(1, Math.ceil(session.capacity * .25)) ? "limited" : "available";
}

export function PublicHome() {
  const { language, setLanguage, t, local } = useLanguage();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<CourseType | "all">("all");
  const [view, setView] = useState<ScheduleView>("day");
  const [date, setDate] = useState(today());
  const [selected, setSelected] = useState<Session | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [meTab, setMeTab] = useState<"bookings" | "cards" | "orders">("bookings");
  const [me, setMe] = useState<MemberMe | null>(null);
  const [phone, setPhone] = useState("13900001001");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingSession, setPendingSession] = useState<number | null>(null);
  const [pendingProduct, setPendingProduct] = useState<number | null>(null);
  const days = useMemo(() => {
    const start = weekStart(date);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [date]);
  const range = useMemo(() => {
    if (view === "week") { const start = weekStart(date); return { start, end: addDays(start, 6) }; }
    if (view === "month") return { start: monthStart(date), end: monthEnd(date) };
    return { start: date, end: date };
  }, [date, view]);
  const monthCells = useMemo(() => {
    const first = new Date(`${range.start}T12:00:00`);
    const offset = (first.getDay() + 6) % 7;
    const count = Number(range.end.slice(8));
    const length = Math.ceil((offset + count) / 7) * 7;
    return Array.from({ length }, (_, index) => index >= offset && index < offset + count ? addDays(range.start, index - offset) : null);
  }, [range]);
  const sessionsByDate = useMemo(() => {
    const grouped = new Map<string, Session[]>();
    sessions.forEach((session) => grouped.set(session.session_date, [...(grouped.get(session.session_date) ?? []), session]));
    return grouped;
  }, [sessions]);
  const rangeLabel = useMemo(() => {
    const locale = language === "zh" ? "zh-CN" : "en-US";
    if (view === "month") return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(new Date(`${range.start}T12:00:00`));
    if (view === "week") return `${shortDate(range.start)} – ${shortDate(range.end)} · ${range.end.slice(0, 4)}`;
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(`${date}T12:00:00`));
  }, [date, language, range, view]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ date_from: range.start, date_to: range.end });
      if (type !== "all") query.set("course_type", type);
      const result = await apiFetch<{ items: Session[] }>(`/api/public/sessions?${query}`);
      setSessions(result.items);
    } catch (err) { setError(err instanceof Error ? err.message : t("error")); }
    finally { setLoading(false); }
  }, [range, type, t]);

  const loadMe = useCallback(async () => {
    if (!getToken("member")) return;
    try { setMe(await apiFetch<MemberMe>("/api/public/me", { tokenKind: "member" })); }
    catch { localStorage.removeItem("wellness_member_token"); setMe(null); }
  }, []);

  useEffect(() => {
    void apiFetch<Bootstrap>("/api/public/bootstrap").then(setData).catch((err) => setError(err instanceof Error ? err.message : t("error")));
    void loadMe();
  }, [loadMe, t]);
  useEffect(() => { void loadSessions(); }, [loadSessions]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function completeBooking(sessionId: number) {
    setBusy(true); setError("");
    try {
      await apiFetch<Booking>("/api/public/bookings", { method: "POST", json: { session_id: sessionId }, tokenKind: "member" });
      setMessage(t("confirmedBooking")); setSelected(null); await Promise.all([loadSessions(), loadMe()]);
    } catch (err) { setError(err instanceof Error ? err.message : t("error")); }
    finally { setBusy(false); }
  }

  function requestBooking(session: Session) {
    if (!getToken("member")) { setPendingSession(session.id); setLoginOpen(true); return; }
    void completeBooking(session.id);
  }

  async function completeOrder(productId: number) {
    setBusy(true); setError("");
    try {
      const order = await apiFetch<{ redemption_code: string }>("/api/public/orders", { method: "POST", json: { product_id: productId }, tokenKind: "member" });
      setMessage(`${t("orderCreated")} ${order.redemption_code}`); await loadMe(); setMeTab("orders"); setMeOpen(true);
    } catch (err) { setError(err instanceof Error ? err.message : t("error")); }
    finally { setBusy(false); }
  }

  function requestOrder(product: Product) {
    if (!getToken("member")) { setPendingProduct(product.id); setLoginOpen(true); return; }
    void completeOrder(product.id);
  }

  async function sendCode() {
    setError(""); setBusy(true);
    try {
      const result = await apiFetch<{ dev_code?: string }>("/api/public/auth/send-code", { method: "POST", json: { phone } });
      setDevCode(result.dev_code ?? ""); if (result.dev_code) setCode(result.dev_code); setCooldown(60);
    } catch (err) { setError(err instanceof Error ? err.message : t("error")); }
    finally { setBusy(false); }
  }

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await apiFetch<{ access_token: string }>("/api/public/auth/login", { method: "POST", json: { phone, code, name } });
      localStorage.setItem("wellness_member_token", result.access_token);
      await loadMe(); setLoginOpen(false);
      if (pendingSession) { await completeBooking(pendingSession); setPendingSession(null); }
      if (pendingProduct) { await completeOrder(pendingProduct); setPendingProduct(null); }
    } catch (err) { setError(err instanceof Error ? err.message : t("error")); }
    finally { setBusy(false); }
  }

  async function cancelBooking(booking: Booking) {
    if (!window.confirm(language === "zh" ? "确认取消这次预约？" : "Cancel this booking?")) return;
    setError("");
    try {
      await apiFetch(`/api/public/bookings/${booking.id}`, { method: "DELETE", tokenKind: "member" });
      setMessage(t("cancelledBooking")); await Promise.all([loadMe(), loadSessions()]);
    } catch (err) { setError(err instanceof Error ? err.message : t("error")); }
  }

  function isPast(session: Session) {
    return new Date(`${session.session_date}T${session.start_time}:00`).getTime() <= Date.now();
  }

  function statusLabel(status: string) {
    return status === "booked" ? t("statusBooked") : status === "checked_in" ? t("statusChecked") : status === "completed" ? t("statusCompleted") : status === "no_show" ? t("statusNoShow") : t("statusCancelled");
  }

  function navigatePeriod(direction: number) {
    setDate(view === "month" ? shiftMonth(date, direction) : addDays(date, direction * (view === "week" ? 7 : 1)));
  }
  function openDay(value: string) { setDate(value); setView("day"); }
  function seatText(session: Session) {
    const status = seatStatus(session);
    return status === "full" ? t("full") : status === "limited" ? local("席位紧张", "Few spots") : local("余位充足", "Available");
  }
  function calendarSession(session: Session, compact = false) {
    return <button type="button" key={session.id} className={`public-calendar-class capacity-${seatStatus(session)} ${isPast(session) ? "is-past" : ""}`} style={{ "--course-color": session.course.color } as React.CSSProperties} onClick={() => setSelected(session)} aria-label={`${session.start_time} ${local(session.course.name, session.course.name_en)}，${seatText(session)}，${local(`剩余 ${session.available} 席`, `${session.available} spots left`)}`}>
      <span className="calendar-class-main"><time>{session.start_time}</time><strong>{local(session.course.name, session.course.name_en)}</strong></span>
      {!compact && <small>{local(session.teacher.name, session.teacher.name_en)}</small>}
      <span className="calendar-seat">{session.available === 0 ? t("full") : local(`余 ${session.available} 席`, `${session.available} left`)} · {session.booked_count}/{session.capacity}</span>
    </button>;
  }

  return <div className="public-site">
    <header className="public-header">
      <a href="#top" className="brand" aria-label="Yinyu Wellness"><span className="brand-mark"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M28 6C15 7 8 13 8 23c7 1 15-2 20-17Z"/><path d="M8 29c3-8 8-12 16-17"/></svg></span><span><strong>{data ? local(data.venue.name, data.venue.name_en) : "音昱 Wellness"}</strong><small>MIND · BODY · EVERYDAY</small></span></a>
      <nav className="public-nav" aria-label="Main"><a href="#schedule">{t("schedule")}</a><a href="#teachers">{t("teachers")}</a><a href="#membership">{t("membership")}</a></nav>
      <div className="header-actions"><button className="text-button" type="button" onClick={() => setLanguage(language === "zh" ? "en" : "zh")}>{t("language")}</button><button className="account-button" type="button" aria-label={me?.member.name ?? t("login")} onClick={() => getToken("member") ? setMeOpen(true) : setLoginOpen(true)}><Icon name="user" size={18}/><span>{me?.member.name ?? t("login")}</span></button></div>
    </header>

    <a className="skip-link" href="#main-content">{local("跳到主要内容", "Skip to main content")}</a>
    <main id="main-content">
      <section className="hero-section" id="top">
        <div className="hero-orbit" aria-hidden="true"><span/><span/><span/></div>
        <div className="hero-copy"><p className="hero-eyebrow">{t("heroEyebrow")}</p><h1>{t("heroTitle")}</h1><p className="hero-description">{t("heroText")}</p><div className="hero-buttons"><a className="button button-primary" href="#schedule">{t("viewSchedule")}<Icon name="arrow" size={18}/></a><a className="button button-ghost" href="#about">{t("explore")}</a></div></div>
        <div className="hero-visual" aria-label={local("安静练习的空间", "A quiet space for practice")}><img src="https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=1400&q=85" alt={local("自然光下的瑜伽练习", "Yoga practice in natural light")} /><div className="hero-note"><span>YINYU / 01</span><p>{local("呼吸 · 觉察 · 生长", "Breathe · Notice · Grow")}</p></div></div>
        <span className="hero-watermark" aria-hidden="true">息</span>
      </section>

      <section className="intro-section" id="about"><p className="section-index">YINYU PHILOSOPHY</p><div><h2>{local("不追求更用力，\n而是更了解自己。", "Not more force.\nMore understanding.")}</h2><p>{local("我们把传统养生、现代运动与正念练习放在同一个日常里。小班教学，诚实建议，让每一次练习都有来处，也有归处。", "Traditional wellness, modern movement and mindfulness belong in the same everyday life. Small classes, honest guidance, and practice with purpose.")}</p></div></section>

      <section className="schedule-section" id="schedule">
        <div className="section-heading"><div><span className="eyebrow">MOVE WITH US</span><h2>{t("schedule")}</h2></div><p>{local("日 / 周 / 月课表 · 实时名额 · 课前可自主取消", "Day, week and month views · Live availability · Cancel before class")}</p></div>
        <div className="filter-bar">
          <div className="type-tabs" role="tablist" aria-label={local("课程类型", "Class types")}>{types.map((item) => <button key={item} type="button" role="tab" aria-selected={type === item} className={type === item ? "active" : ""} onClick={() => setType(item)}>{t(item)}</button>)}</div>
          <div className="schedule-view-switch" role="tablist" aria-label={local("课表视图", "Schedule view")}>{(["day", "week", "month"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "day" ? local("日", "Day") : item === "week" ? local("周", "Week") : local("月", "Month")}</button>)}</div>
        </div>
        <div className="schedule-navigation">
          <button className="icon-button" type="button" aria-label={view === "day" ? local("前一天", "Previous day") : view === "week" ? local("上一周", "Previous week") : local("上一月", "Previous month")} onClick={() => navigatePeriod(-1)}><span className="schedule-nav-prev"><Icon name="chevron" size={18}/></span></button>
          <div className="schedule-period-label"><strong>{rangeLabel}</strong><span>{local(`${sessions.length} 节课程`, `${sessions.length} classes`)}</span></div>
          <button className="icon-button" type="button" aria-label={view === "day" ? local("后一天", "Next day") : view === "week" ? local("下一周", "Next week") : local("下一月", "Next month")} onClick={() => navigatePeriod(1)}><Icon name="chevron" size={18}/></button>
          <button className="schedule-today" type="button" onClick={() => setDate(today())}>{local("回到今天", "Today")}</button>
          <div className="capacity-legend" aria-label={local("席位状态图例", "Availability legend")}><span className="capacity-available"><i/>{local("余位充足", "Available")}</span><span className="capacity-limited"><i/>{local("席位紧张", "Few spots")}</span><span className="capacity-full"><i/>{local("已约满", "Full")}</span></div>
        </div>
        {view === "day" && <div className="date-strip">{days.map((day) => <button type="button" key={day} className={date === day ? "active" : ""} onClick={() => setDate(day)}><span>{weekday(day, language === "en")}</span><strong>{shortDate(day)}</strong>{day === today() && <small>{local("今天", "Today")}</small>}</button>)}</div>}
        {error && <div className="public-notice error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label={t("close")}><Icon name="close" size={16}/></button></div>}
        {message && <div className="public-notice" role="status">{message}<button type="button" onClick={() => setMessage("")} aria-label={t("close")}><Icon name="close" size={16}/></button></div>}
        {loading ? <Spinner/> : view === "day" ? sessions.length === 0 ? <Empty>{local("这一天暂未排课，看看其他日期吧。", "No classes on this day. Try another date.")}</Empty> : <div className="class-list">{sessions.map((session) => <article className={`class-row capacity-${seatStatus(session)} ${session.available === 0 ? "sold-out" : ""}`} key={session.id} style={{ "--course-color": session.course.color } as React.CSSProperties}>
          <div className="class-time"><strong>{session.start_time}</strong><span>{session.end_time}</span></div>
          <button className="class-main" type="button" onClick={() => setSelected(session)}><span className="class-category">{t(session.course.course_type)}</span><h3>{local(session.course.name, session.course.name_en)}</h3><p>{local(session.teacher.name, session.teacher.name_en)} · {local(session.room.name, session.room.name_en)}</p></button>
          <div className="class-capacity"><span className="seat-status"><i/>{seatText(session)}</span><span className="seat-count"><strong>{session.available}</strong> {t("available")}</span><small>{session.booked_count}/{session.capacity} {t("booked")}</small></div>
          <button className="button button-small" disabled={session.available === 0 || isPast(session) || busy} type="button" onClick={() => requestBooking(session)}>{isPast(session) ? local("已结束", "Ended") : session.available === 0 ? t("full") : t("bookNow")}<Icon name="chevron" size={16}/></button>
        </article>)}</div> : view === "week" ? <div className="public-week-scroll"><div className="public-week-grid">{days.map((day) => {
          const daySessions = sessionsByDate.get(day) ?? [];
          return <article className={`public-week-day ${day === today() ? "today" : ""}`} key={day}><header><button type="button" onClick={() => openDay(day)} aria-label={local(`查看 ${day} 日课表`, `View classes on ${day}`)}><span>{weekday(day, language === "en")}</span><strong>{shortDate(day)}</strong></button><small>{local(`${daySessions.length} 节`, `${daySessions.length}`)}</small></header><div className="public-week-classes">{daySessions.map((session) => calendarSession(session))}{daySessions.length === 0 && <p className="calendar-no-class">{local("暂无课程", "No classes")}</p>}</div></article>;
        })}</div></div> : <div className="public-month-scroll"><div className="public-month-calendar">{days.map((day) => <div className="month-weekday" key={`heading-${day}`}>{weekday(day, language === "en")}</div>)}{monthCells.map((day, index) => {
          if (!day) return <div className="public-month-cell outside" aria-hidden="true" key={`blank-${index}`}/>;
          const daySessions = sessionsByDate.get(day) ?? [];
          return <article className={`public-month-cell ${day === today() ? "today" : ""}`} key={day}><header><button className="month-day-number" type="button" onClick={() => openDay(day)} aria-label={local(`查看 ${day} 日课表`, `View classes on ${day}`)}>{Number(day.slice(8))}</button>{daySessions.length > 0 && <small>{local(`${daySessions.length} 节`, `${daySessions.length}`)}</small>}</header><div className="public-month-classes">{daySessions.slice(0, 3).map((session) => calendarSession(session, true))}{daySessions.length > 3 && <button className="month-more" type="button" onClick={() => openDay(day)}>{local(`查看其余 ${daySessions.length - 3} 节`, `+${daySessions.length - 3} more`)}</button>}</div></article>;
        })}</div></div>}
      </section>

      <section className="teachers-section" id="teachers"><div className="section-heading"><div><span className="eyebrow">PEOPLE MAKE PRACTICE</span><h2>{t("teachers")}</h2></div><p>{local("专业，而不距离感。", "Expertise, without distance.")}</p></div><div className="teacher-grid">{data?.teachers.map((teacher, index) => <article className="teacher-card" key={teacher.id}><div className="teacher-photo"><img src={teacher.image_url} alt={local(teacher.name, teacher.name_en)} loading="lazy"/><span>0{index + 1}</span></div><h3>{local(teacher.name, teacher.name_en)}</h3><p className="teacher-specialty">{local(teacher.specialties, teacher.specialties_en)}</p><p>{local(teacher.bio, teacher.bio_en)}</p></article>)}</div></section>

      <section className="membership-section" id="membership"><div className="section-heading"><div><span className="eyebrow">YOUR PRACTICE, YOUR PACE</span><h2>{t("membership")}</h2></div><p>{local("次卡、周期卡与私教套餐，按你的节奏选择。", "Class packs, passes and private programs for your own rhythm.")}</p></div><div className="product-grid">{data?.products.filter((product) => product.online_sale).slice(0, 6).map((product) => <article className="product-card" key={product.id}><span className="product-type">{product.category.toUpperCase()}</span><h3>{local(product.name, product.name_en)}</h3><div className="product-price"><strong>{money(product.price)}</strong><span>/ {product.total_sessions ? `${product.total_sessions} ${t("sessions")}` : t("unlimited")}</span></div><p>{product.validity_days} {t("validDays")}</p><button className="button button-outline" type="button" disabled={busy} onClick={() => requestOrder(product)}>{t("buy")}<Icon name="arrow" size={17}/></button></article>)}</div></section>
    </main>

    <footer className="public-footer"><div><span className="brand footer-brand"><span className="brand-mark"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M28 6C15 7 8 13 8 23c7 1 15-2 20-17Z"/><path d="M8 29c3-8 8-12 16-17"/></svg></span><strong>{data ? local(data.venue.name, data.venue.name_en) : "音昱 Wellness"}</strong></span><p>{data && local(data.venue.address, data.venue.address_en)}</p></div><div><a href={`tel:${data?.venue.phone}`}><Icon name="phone" size={17}/>{data?.venue.phone}</a><Link to="/login"><Icon name="user" size={17}/>{t("staff")}</Link></div></footer>

    <nav className="mobile-bottom-nav" aria-label="Mobile"><a href="#top"><Icon name="home"/><span>{t("home")}</span></a><a href="#schedule"><Icon name="calendar"/><span>{t("book")}</span></a><button type="button" onClick={() => getToken("member") ? setMeOpen(true) : setLoginOpen(true)}><Icon name="user"/><span>{t("account")}</span></button></nav>

    {selected && <Modal title={t("details")} onClose={() => setSelected(null)}><div className="class-detail"><div className="class-detail-color" style={{ background: selected.course.color }}/><span className="class-category">{t(selected.course.course_type)}</span><h3>{local(selected.course.name, selected.course.name_en)}</h3><p>{local(selected.course.description, selected.course.description_en)}</p><dl><div><dt>{t("teacher")}</dt><dd>{local(selected.teacher.name, selected.teacher.name_en)}</dd></div><div><dt>{t("room")}</dt><dd>{local(selected.room.name, selected.room.name_en)}</dd></div><div><dt><Icon name="calendar" size={17}/></dt><dd>{selected.session_date} · {selected.start_time}–{selected.end_time}</dd></div><div><dt><Icon name="clock" size={17}/></dt><dd>{selected.course.duration_minutes} {t("minutes")}</dd></div></dl><div className="teacher-mini">{selected.teacher.image_url && <img src={selected.teacher.image_url} alt=""/>}<p>{local(selected.teacher.bio, selected.teacher.bio_en)}</p></div><button className="button button-primary button-full" disabled={selected.available === 0 || isPast(selected) || busy} type="button" onClick={() => requestBooking(selected)}>{isPast(selected) ? local("已结束", "Ended") : selected.available === 0 ? t("full") : `${t("bookNow")} · ${selected.available} ${t("available")}`}</button></div></Modal>}

    {loginOpen && <Modal title={t("login")} onClose={() => { setLoginOpen(false); setPendingSession(null); setPendingProduct(null); }}><form className="auth-form" onSubmit={login}><p>{local("新会员验证手机号后会自动建立档案。演示会员可使用 13900001001。", "New members are registered automatically after phone verification. Demo member: 13900001001.")}</p><label>{t("phone")}<input required pattern="1[0-9]{10}" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)}/></label><label>{t("name")}<input value={name} onChange={(event) => setName(event.target.value)} placeholder={local("新会员填写", "For new members")}/></label><label>{t("code")}<div className="code-input"><input required inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)}/><button className="button button-outline" type="button" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown > 0 ? `${cooldown}s` : t("sendCode")}</button></div></label>{devCode && <p className="dev-code">{t("devCode")}: <strong>{devCode}</strong></p>}<button className="button button-primary button-full" disabled={busy} type="submit">{busy ? t("loading") : t("submit")}</button></form></Modal>}

    {meOpen && <Modal title={`${local("你好", "Hello")}，${me?.member.name ?? ""}`} wide onClose={() => setMeOpen(false)}><div className="me-tabs"><button className={meTab === "bookings" ? "active" : ""} onClick={() => setMeTab("bookings")} type="button">{t("myBookings")}</button><button className={meTab === "cards" ? "active" : ""} onClick={() => setMeTab("cards")} type="button">{t("myCards")}</button><button className={meTab === "orders" ? "active" : ""} onClick={() => setMeTab("orders")} type="button">{t("myOrders")}</button><button className="logout-link" type="button" onClick={() => { localStorage.removeItem("wellness_member_token"); setMe(null); setMeOpen(false); }}>{t("logout")}</button></div>
      {meTab === "bookings" && <div className="me-list">{!me?.bookings.length ? <Empty>{t("noBookings")}</Empty> : me.bookings.map((booking) => <article key={booking.id} className={booking.status === "cancelled" ? "muted" : ""}><div><span className={`status-dot status-${booking.status}`}/><h3>{local(booking.session!.course.name, booking.session!.course.name_en)}</h3><p>{booking.session!.session_date} · {booking.session!.start_time}–{booking.session!.end_time}</p><small>{local(booking.session!.teacher.name, booking.session!.teacher.name_en)} · {local(booking.session!.room.name, booking.session!.room.name_en)}</small></div><div><span className="booking-status">{statusLabel(booking.status)}</span>{booking.status === "booked" && <><button className="text-button" type="button" onClick={() => void downloadFile(`/api/public/bookings/${booking.id}/calendar.ics`, `booking-${booking.id}.ics`, "member")}>{t("addCalendar")}</button><button className="text-button danger" type="button" onClick={() => void cancelBooking(booking)}>{t("cancel")}</button></>}</div></article>)}</div>}
      {meTab === "cards" && <div className="member-card-grid">{!me?.cards.length ? <Empty>{t("noCards")}</Empty> : me.cards.map((card) => <article className="member-pass" key={card.id}><span>{card.card_no}</span><h3>{local(card.product_name, card.product_name_en)}</h3><strong>{card.remaining_sessions ?? t("unlimited")}<small>{card.remaining_sessions !== null ? ` ${t("sessions")}` : ""}</small></strong><p>{t("expires")} {card.expires_on}</p><div className="pass-benefits">{card.benefits.map((benefit) => <span key={benefit.course_type}>{t(benefit.course_type as CourseType)} {benefit.remaining ?? benefit.quantity}</span>)}</div></article>)}</div>}
      {meTab === "orders" && <div className="me-list">{me?.transactions.map((order) => <article key={order.id}><div><h3>{order.note}</h3><p>{order.occurred_at} · {order.status}</p>{order.redemption_code && <strong className="redeem-code">{order.redemption_code}</strong>}</div><strong>{money(order.amount)}</strong></article>)}</div>}
    </Modal>}
  </div>;
}
