import { useEffect, useId, useRef, type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";

export type IconName = "calendar" | "users" | "room" | "card" | "chart" | "settings" | "home" | "user" | "plus" | "search" | "close" | "arrow" | "check" | "clock" | "phone" | "logout" | "menu" | "download" | "money" | "book" | "bell" | "database" | "chevron";
const paths: Record<IconName, ReactNode> = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  room: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4"/></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>,
  chart: <><path d="M3 3v18h18M7 16v-5M12 16V8M17 16V5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3v-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.37.42.7.77.9.35.2.75.3 1.15.28H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></>,
  home: <><path d="m3 11 9-8 9 8v10h-6v-6H9v6H3Z"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  close: <path d="M6 6l12 12M18 6 6 18"/>, arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  check: <path d="m5 12 4 4L19 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9Z"/>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>, download: <><path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/></>,
  money: <><circle cx="12" cy="12" r="9"/><path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8M12 6v12"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5ZM4 5.5v14"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) { return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>; }

let openModalCount = 0;
let originalBodyOverflow = "";

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const { t } = useLanguage();
  const modalRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
    const isTopModal = () => document.querySelectorAll<HTMLElement>(".modal").item(document.querySelectorAll(".modal").length - 1) === modalRef.current;
    const handler = (event: KeyboardEvent) => {
      if (!isTopModal()) return;
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    if (openModalCount === 0) originalBodyOverflow = document.body.style.overflow;
    openModalCount += 1;
    document.body.style.overflow = "hidden";
    modalRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = originalBodyOverflow;
      previousFocus?.focus();
    };
  }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={modalRef} className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label={t("close")}><Icon name="close" /></button></header><div className="modal-body">{children}</div></section></div>;
}

export function ResponsiveTable({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const table = containerRef.current?.querySelector("table");
    if (!table) return;
    const labels = Array.from(table.querySelectorAll("thead th"), (header) => header.textContent?.trim() ?? "");
    table.querySelectorAll("tbody tr").forEach((row) => {
      row.querySelectorAll("td").forEach((cell, index) => cell.setAttribute("data-label", labels[index] ?? ""));
    });
  });
  return <div ref={containerRef} className="responsive-table">{children}</div>;
}

export function LogoutConfirm({ title, description, cancelLabel, confirmLabel, onClose, onConfirm }: { title: string; description: string; cancelLabel: string; confirmLabel: string; onClose: () => void; onConfirm: () => void }) {
  return <Modal title={title} onClose={onClose}><div className="logout-confirmation"><span className="logout-confirmation-icon"><Icon name="logout" size={25}/></span><p>{description}</p><div className="logout-confirmation-actions"><button className="button button-outline" type="button" onClick={onClose}>{cancelLabel}</button><button className="button button-primary" type="button" onClick={onConfirm}><Icon name="logout" size={17}/>{confirmLabel}</button></div></div></Modal>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "red" | "amber" | "blue" }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty-state"><Icon name="calendar" size={28} /><p>{children}</p></div>; }
export function Spinner() { const { t } = useLanguage(); return <div className="loading-state" role="status"><span className="spinner" />{t("loading")}</div>; }
