/** Discovery queries shared by seed.ts (REST, no token) and backfill.ts (GraphQL, token). */
export const LANGS = ["python", "typescript", "javascript", "go", "rust", "java", "c++", "c#", "ruby", "swift", "kotlin", "php"];
// Problem-shaped topics so the index covers what people actually ask for.
export const TOPICS = [
  "pdf", "web-scraping", "orm", "authentication", "cli", "testing", "http-client", "web-framework", "state-management",
  "charts", "markdown", "image-processing", "queue", "cache", "search-engine", "vector-database", "llm", "agents", "rag",
  "websocket", "graphql", "validation", "date", "logging", "config", "cron", "email", "payments", "i18n", "ocr",
  "speech-to-text", "video", "game-engine", "terminal-ui", "parser", "compiler", "mcp", "mcp-server", "claude-code",
];
export const SKILL_REPOS = [["anthropics", "skills"], ["vercel-labs", "skills"], ["obra", "superpowers"]];
