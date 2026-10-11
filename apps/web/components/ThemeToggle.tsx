"use client";
import { useEffect, useState } from "react";

type Mode = "auto" | "light" | "dark";
const KEY = "reppit-theme";

/** Sets data-theme on <html>. "auto" removes it so prefers-color-scheme decides. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("auto");
  useEffect(() => {
    try { const m = localStorage.getItem(KEY); if (m === "light" || m === "dark") setMode(m); } catch { /* storage blocked */ }
  }, []);
  function pick(m: Mode) {
    setMode(m);
    const root = document.documentElement;
    if (m === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", m);
    try { if (m === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch { /* storage blocked */ }
  }
  return (
    <span className="theme" role="group" aria-label="Colour theme">
      <span className="lbl">Theme</span>
      {(["auto", "light", "dark"] as Mode[]).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)}>{m}</button>
      ))}
    </span>
  );
}

/** Inline, pre-paint: apply a saved choice before first render so there is no flash. */
export const themeScript = `try{var m=localStorage.getItem("${KEY}");if(m==="light"||m==="dark")document.documentElement.setAttribute("data-theme",m)}catch(e){}`;
