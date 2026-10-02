/** Theme preference shared by the inline boot script and the toggle. */

export const THEME_KEY = "tejrouter.theme";
export type ThemePref = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === "dark" || pref === "light") return pref;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

export function readThemePref(): ThemePref {
  try {
    const v = JSON.parse(window.localStorage.getItem(THEME_KEY) ?? "null");
    return v === "dark" || v === "light" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref): void {
  const t = resolveTheme(pref);
  const el = document.documentElement;
  el.setAttribute("data-theme", t);
  el.style.colorScheme = t;
}

/**
 * Runs in <head> before first paint: resolves the stored preference (or the OS
 * setting) and stamps data-theme on <html>. Dark is the server default.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)})||'"system"');var t=p==="light"||p==="dark"?p:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");var d=document.documentElement;d.setAttribute("data-theme",t);d.style.colorScheme=t}catch(e){}})()`;
