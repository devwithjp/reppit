/**
 * The trust score and signal cells, from @gitit/core: one number shared by the web, API, MCP server
 * and CLI. Screens import from here so the source can move without touching them.
 * Server components only: @gitit/core pulls in the database layer and must not reach a client bundle.
 */
export {
  trustScore, signalCells, SIGNAL_ORDER, VOTE_ADJUST_MAX, FLAGGED_CAP, MAX_UNKNOWN, MIN_MEASURED, STALE_CAPS, TRUST_POINTS,
  type SignalCell, type SignalState as CellState, type TrustScore,
} from "@gitit/core";
