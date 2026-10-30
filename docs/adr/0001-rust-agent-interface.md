---
status: accepted
---

# Rust owns the agent-facing interface

The original v1 plan kept the HTTP interface in Next.js and shipped a TypeScript CLI for one-deploy simplicity. We now keep Next.js for the product interface, but move the versioned agent-facing HTTP interface and CLI to Rust: the native CLI needs fast startup and predictable distribution, while a separate Rust backend keeps its contract and implementation in one language without forcing a finished frontend rewrite. Existing TypeScript routes remain a compatibility adapter until parity tests prove each Rust slice.

## Consequences

- `reppit.dev` hosts the Next.js frontend and `api.reppit.dev` hosts the Rust backend as separate Vercel projects.
- The external seam is versioned JSON under `/api/v1`; frontend, CLI, and MCP callers use the same contract.
- Migration is vertical: health and search first, then item reads, then authenticated community writes.
- The Rust deployment uses Vercel&rsquo;s container runtime, which is currently beta; the TypeScript adapter remains the rollback path through launch.
