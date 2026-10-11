import { InstallCmd } from "./InstallCmd";
import { installFor } from "./labels";

type Row = Parameters<typeof installFor>[0];

/**
 * The install line for a library or skill: a copyable command when there is a verified one,
 * otherwise "See install docs" linking to the README, with a short label and no copy button.
 */
export function Install({ item, compact = false, withNote = false }: { item: Row; compact?: boolean; withNote?: boolean }) {
  const r = installFor(item);
  if (r.type === "command") return <InstallCmd command={r.command} compact={compact} note={withNote ? r.note : undefined} />;
  return (
    <>
      <div className={`cmd cmd-docs${compact ? " cmd-sm" : ""}`}>
        <a className="docs-link" href={r.href} target="_blank" rel="noreferrer" data-testid="install-command">
          See install docs &#8599;<span className="sr-only"> (opens the README on GitHub)</span>
        </a>
        {r.label && <span className="docs-label">{r.label}</span>}
      </div>
      {withNote && r.note && <p className="meta" style={{ margin: "6px 0 0" }}>{r.note}</p>}
    </>
  );
}
