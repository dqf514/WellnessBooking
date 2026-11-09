import { useBranding } from "@/context/BrandingContext";

export function BrandLogo() {
  const { logoUrl } = useBranding();
  return <span className="brand-mark">{logoUrl ? <img src={logoUrl} alt="" /> : <svg viewBox="0 0 36 36" aria-hidden="true"><path d="M28 6C15 7 8 13 8 23c7 1 15-2 20-17Z"/><path d="M8 29c3-8 8-12 16-17"/></svg>}</span>;
}
