import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import type { Bootstrap } from "@/types";

interface BrandingValue { logoUrl: string; faviconUrl: string; refreshBranding: () => Promise<void> }
const BrandingContext = createContext<BrandingValue>({ logoUrl: "", faviconUrl: "", refreshBranding: async () => {} });
const defaultFavicon = document.querySelector<HTMLLinkElement>("link[rel='icon']")?.href ?? "";

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const refreshBranding = useCallback(async () => {
    try {
      const result = await apiFetch<Bootstrap>("/api/public/bootstrap");
      setLogoUrl(result.venue.logo_url || "");
      setFaviconUrl(result.venue.favicon_url || "");
    } catch {
      setLogoUrl("");
      setFaviconUrl("");
    }
  }, []);
  useEffect(() => { void refreshBranding(); }, [refreshBranding]);
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    if (faviconUrl) link.type = "image/png";
    else link.removeAttribute("type");
    link.href = faviconUrl || defaultFavicon;
  }, [faviconUrl]);
  return <BrandingContext.Provider value={{ logoUrl, faviconUrl, refreshBranding }}>{children}</BrandingContext.Provider>;
}

export function useBranding() { return useContext(BrandingContext); }
