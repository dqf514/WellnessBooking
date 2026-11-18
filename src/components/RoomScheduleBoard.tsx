import { useEffect, useMemo, useRef, useState } from "react";
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
  const now = useClock();

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
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
  }, [rooms.length, hours.length]);

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
    <div className="room-board" role="dialog" aria-modal="true" aria-label={local("全屏排课表", "Full screen schedule")}>
      <header className="room-board-header">
        <div className="room-board-title"><strong>{local("音昱 Wellness · 今日排课", "Yinyu Wellness · Today schedule")}</strong></div>
        <div className="room-board-center">
          <div className="room-board-date"><b>{date}</b><span>{weekday}</span></div>
          <div className="room-board-clock">{pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}</div>
        </div>
        <div className="room-board-tools">
          <p className="room-board-hint">{local("← → 切换日期 · Esc 退出 · Ctrl+P 打印当前画面", "← → change date · Esc to exit · Ctrl+P to print")}</p>
          <button className="icon-button" type="button" onClick={() => closeRef.current()} aria-label={local("退出全屏", "Exit full screen")}><Icon name="close"/></button>
        </div>
      </header>
      <div className="room-board-body" ref={bodyRef} style={{ "--board-room-count": rooms.length, "--board-room-width": `${layout.roomWidth}px` } as React.CSSProperties}>
        <div className="room-board-axis"><header>{local("时间", "Time")}</header><div className="room-board-axis-track" style={{ height: `${span}px` }}>{hours.map((hour) => <span key={hour} style={{ top: `${(hour - hours[0]) * layout.hourHeight}px` }}>{String(hour).padStart(2, "0")}:00</span>)}</div></div>
        <div className="room-board-grid">
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
    </div>,
    document.body,
  );
}
