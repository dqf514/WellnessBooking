import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Notice({ message, error = false }: { message: string; error?: boolean }) {
  return <div className={`notice ${error ? "notice-error" : ""}`} role={error ? "alert" : "status"}>{message}</div>;
}
