import { InstallCmd } from "./InstallCmd";
import { REPPIT_PUBLISHED, UNPUBLISHED_NOTE } from "./labels";

/** A reppit CLI or MCP install line, or, until the packages are published, a plain note with nothing to copy. */
export function ReppitInstall({ command, compact = false }: { command: string; compact?: boolean }) {
  if (!REPPIT_PUBLISHED) return <p className="unpublished" data-testid="reppit-unpublished">{UNPUBLISHED_NOTE}</p>;
  return <InstallCmd command={command} compact={compact} />;
}
