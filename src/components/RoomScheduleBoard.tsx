import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/UI";
import type { Room, Session } from "@/types";

export interface BoardReservation { id: number; room_id: number; title: string; reservation_date: string; start_time: string; end_time: string; usage_type: string; notes: string }
export interface BoardRoom extends Room { sessions: Session[]; reservations: BoardReservation[] }

const AXIS_WIDTH = 52;
const COLUMN_HEADER = 30;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function toMinutes(value: string) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function pad(value: number) { return String(value).padStart(2, "0"); }

// 进入浏览器全屏：隐藏地址栏与工具栏，效果等同于按 F11；被浏览器拒绝时退回整页浮层。
export function requestBoardFullscreen() {
  const root = document.documentElement;
  if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => {});
}

// 大屏配色模式：浅色 / 深色，选择结果记住，下次打开沿用。
const THEME_KEY = "wellness_board_theme";
type BoardTheme = "light" | "dark";
function useBoardTheme() {
  const [theme, setTheme] = useState<BoardTheme>(() => (window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"));
  useEffect(() => { window.localStorage.setItem(THEME_KEY, theme); }, [theme]);
  return { theme, toggle: () => setTheme((current) => (current === "dark" ? "light" : "dark")) };
}

// 大屏时钟：每秒跳动一次。
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

// 公共区域大屏用的全屏排课表：所有教室一次铺开，按可用空间压缩列宽与行高，保证不用上下左右滚动即可看全。
export function RoomScheduleBoard({ rooms, date, hours, local, onPrev, onNext, onClose }: {
  rooms: BoardRoom[];
  date: string;
  hours: number[];
  local: (zh: string, en: string) => string;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [layout, setLayout] = useState({ hourHeight: 48, roomWidth: 110 });
  // 手机端：全屏排课表改为固定格宽 + 可缩放画布，桌面端仍然铺满整屏不动。
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ mode: "pan" | "pinch"; origin: { x: number; y: number }; startDist: number; startZoom: number; startPan: { x: number; y: number } } | null>(null);
  const now = useClock();
  const { theme, toggle } = useBoardTheme();

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (compact) { setLayout({ hourHeight: 46, roomWidth: 132 }); return; }
    const update = () => {
      const body = bodyRef.current;
      if (!body) return;
      const height = body.clientHeight - COLUMN_HEADER;
      const width = body.clientWidth - AXIS_WIDTH;
      const hourHeight = Math.max(24, Math.floor(height / Math.max(1, hours.length)));
      const roomWidth = rooms.length ? Math.max(20, Math.floor(width / rooms.length)) : Math.max(20, width);
      setLayout({ hourHeight, roomWidth });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [rooms.length, hours.length, compact]);

  // 切换到手机端布局时重置缩放与位置，避免沿用桌面端的偏移。
  useEffect(() => { zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; setZoom(1); setPan({ x: 0, y: 0 }); }, [compact]);

  // 缩放与平移：以锚点为基准换算画布坐标，缩放时锚点下的内容保持不动。
  function applyZoom(next: number, anchor?: { x: number; y: number }) {
    const body = bodyRef.current;
    const point = anchor ?? { x: (body?.clientWidth ?? 0) / 2, y: (body?.clientHeight ?? 0) / 2 };
    const current = zoomRef.current;
    const clamped = Math.min(3, Math.max(0.5, next));
    const canvasX = (point.x - panRef.current.x) / current;
    const canvasY = (point.y - panRef.current.y) / current;
    zoomRef.current = clamped;
    panRef.current = { x: point.x - canvasX * clamped, y: point.y - canvasY * clamped };
    setZoom(clamped);
    setPan(panRef.current);
  }
  function resetView() { zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; setZoom(1); setPan({ x: 0, y: 0 }); }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!compact) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = { mode: "pinch", origin: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), startZoom: zoomRef.current, startPan: { ...panRef.current } };
    } else {
      gesture.current = { mode: "pan", origin: { x: event.clientX, y: event.clientY }, startDist: 0, startZoom: zoomRef.current, startPan: { ...panRef.current } };
    }
  }
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !compact) return;
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.mode === "pan" && pointers.current.size === 1) {
      const next = { x: g.startPan.x + (event.clientX - g.origin.x), y: g.startPan.y + (event.clientY - g.origin.y) };
      panRef.current = next; setPan(next);
      return;
    }
    if (g.mode === "pinch" && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const canvasX = (g.origin.x - g.startPan.x) / g.startZoom;
      const canvasY = (g.origin.y - g.startPan.y) / g.startZoom;
      const next = Math.min(3, Math.max(0.5, g.startZoom * (dist / g.startDist)));
      zoomRef.current = next;
      panRef.current = { x: mid.x - canvasX * next, y: mid.y - canvasY * next };
      setZoom(next);
      setPan(panRef.current);
    }
  }
  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 1) {
      const remaining = Array.from(pointers.current.values())[0];
      gesture.current = { mode: "pan", origin: { x: remaining.x, y: remaining.y }, startDist: 0, startZoom: zoomRef.current, startPan: { ...panRef.current } };
      return;
    }
    gesture.current = null;
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); onPrev(); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); onNext(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onPrev, onNext]);

  // 浏览器全屏：进入后隐藏地址栏与工具栏；退出全屏时同步关闭大屏。
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) closeRef.current(); };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    document.body.classList.add("room-board-open");
    return () => document.body.classList.remove("room-board-open");
  }, []);

  const weekday = useMemo(() => {
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? "" : WEEKDAYS[parsed.getDay()] ?? "";
  }, [date]);

  const span = hours.length * layout.hourHeight;
  const topOf = (time: string) => Math.max(0, (toMinutes(time) - hours[0] * 60) / 60 * layout.hourHeight);
  // 色块高度覆盖所在的整段时间区间，文字两行随格子自适应。
  const sizeOf = (start: string, end: string) => Math.max(24, (toMinutes(end) - toMinutes(start)) / 60 * layout.hourHeight);

  return createPortal(
    <div className={`room-board ${theme}`} role="dialog" aria-modal="true" aria-label={local("全屏排课表", "Full screen schedule")}>
      <header className="room-board-header">
        <div className="room-board-title"><strong>{local("音昱 Wellness · 今日排课", "Yinyu Wellness · Today schedule")}</strong></div>
        <div className="room-board-center">
          <div className="room-board-date"><b>{date}</b><span>{weekday}</span></div>
          <div className="room-board-clock">{pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}</div>
        </div>
        <div className="room-board-tools">
          <p className="room-board-hint">{compact ? local("单指拖动 · 双指缩放查看全部教室", "Drag to pan · pinch to zoom") : local("← → 切换日期 · Esc 退出 · Ctrl+P 打印当前画面", "← → change date · Esc to exit · Ctrl+P to print")}</p>
          {compact && <div className="room-board-zoom"><button className="icon-button" type="button" aria-label={local("缩小", "Zoom out")} onClick={() => applyZoom(zoomRef.current - 0.2)}><span aria-hidden="true">−</span></button><span>{Math.round(zoom * 100)}%</span><button className="icon-button" type="button" aria-label={local("放大", "Zoom in")} onClick={() => applyZoom(zoomRef.current + 0.2)}><Icon name="plus" size={15}/></button><button className="icon-button" type="button" aria-label={local("复位", "Reset")} onClick={resetView}><Icon name="refresh" size={15}/></button></div>}
          <button className="icon-button room-board-theme" type="button" onClick={toggle} title={theme === "dark" ? local("切换到浅色模式", "Switch to light mode") : local("切换到深色模式", "Switch to dark mode")} aria-label={theme === "dark" ? local("切换到浅色模式", "Switch to light mode") : local("切换到深色模式", "Switch to dark mode")}><Icon name={theme === "dark" ? "sun" : "moon"} size={17}/></button>
          <button className="icon-button" type="button" onClick={() => closeRef.current()} aria-label={local("退出全屏", "Exit full screen")}><Icon name="close"/></button>
        </div>
      </header>
      <div className="room-board-body" ref={bodyRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
        <div className="room-board-canvas" style={compact ? { width: `${AXIS_WIDTH + rooms.length * layout.roomWidth}px`, height: `${COLUMN_HEADER + span}px`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` } : undefined}>
          <div className="room-board-axis"><header>{local("时间", "Time")}</header><div className="room-board-axis-track" style={{ height: `${span}px` }}>{hours.map((hour) => <span key={hour} style={{ top: `${(hour - hours[0]) * layout.hourHeight}px` }}>{String(hour).padStart(2, "0")}:00</span>)}</div></div>
          <div className="room-board-grid" style={{ "--board-room-count": rooms.length, "--board-room-width": `${layout.roomWidth}px` } as React.CSSProperties}>
            {rooms.map((room) => <div className="room-board-column" key={room.id}>
              <header title={`${local(room.name, room.name_en)} · ${room.floor}`}><strong>{local(room.name, room.name_en)}</strong><span>{room.floor}</span></header>
              <div className="room-board-slots" style={{ height: `${span}px` }}>
                {hours.map((hour) => <i key={hour} style={{ top: `${(hour - hours[0]) * layout.hourHeight}px` }}/>)}
                {room.sessions.map((session) => <div className="room-board-block course-block" key={`s-${session.id}`} style={{ top: `${topOf(session.start_time)}px`, height: `${sizeOf(session.start_time, session.end_time)}px`, "--course-color": session.course.color } as React.CSSProperties} title={`${session.start_time}-${session.end_time} ${local(session.course.name, session.course.name_en)} · ${local(session.teacher.name, session.teacher.name_en)} · ${session.booked_count}/${session.capacity}`}><span>{session.start_time}–{session.end_time}</span><strong>{local(session.course.name, session.course.name_en)}</strong></div>)}
                {room.reservations.map((reservation) => <div className={`room-board-block internal-block ${reservation.usage_type}`} key={`r-${reservation.id}`} style={{ top: `${topOf(reservation.start_time)}px`, height: `${sizeOf(reservation.start_time, reservation.end_time)}px` }} title={`${reservation.start_time}-${reservation.end_time} ${reservation.title}${reservation.notes ? ` · ${reservation.notes}` : ""}`}><span>{reservation.start_time}–{reservation.end_time}</span><strong>{reservation.title}</strong></div>)}
              </div>
            </div>)}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
