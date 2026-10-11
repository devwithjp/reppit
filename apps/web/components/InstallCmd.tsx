"use client";
import { useState } from "react";

/** "$ command" with a copy button. Falls back to selecting the text when the clipboard is blocked. */
export function InstallCmd({ command, compact = false, note, prompt = "$", label }: { command: string; compact?: boolean; note?: string; prompt?: string; label?: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    const code = e.currentTarget.parentElement?.querySelector("code");
    try {
      await navigator.clipboard.writeText(command);
      setCopied("ok");
    } catch {
      if (code) { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 1800);
  }
  return (
    <>
      <div className={`cmd${compact ? " cmd-sm" : ""}`}>
        {prompt && <b aria-hidden="true">{prompt}</b>}<code data-testid="install-command">{command}</code>
        <button type="button" className="copy" onClick={copy} data-testid="copy-install" aria-label={label ?? `Copy: ${command}`}>
          {copied === "ok" ? "copied" : copied === "fail" ? "press ctrl+c" : "copy"}
        </button>
        <span className="sr-only" aria-live="polite">{copied === "ok" ? "Copied to clipboard" : ""}</span>
      </div>
      {note && <p className="meta" style={{ margin: "6px 0 0" }}>{note}</p>}
    </>
  );
}
