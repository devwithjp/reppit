/** Refresh the curated skill sources without re-running repository discovery. */
import { config } from "./vendor/dotenv-lite.js";
import { getDb, items } from "@gitit/db";
import { GitHubClient, ingestSkillsFromRepo, embedderFromEnv, itemEmbeddingText } from "@gitit/core";
import { SKILL_REPOS } from "./topics";
config();
const db = await getDb({});
const embedder = embedderFromEnv();
const gh = new GitHubClient();
const only = new Set(process.argv.slice(2));
let failed = false;
for (const { owner, repo, candidateTopics } of SKILL_REPOS) {
  if (only.size && !only.has(`${owner}/${repo}`)) continue;
  try {
    const rows = await ingestSkillsFromRepo(gh, owner, repo, "skills", candidateTopics);
    // Each write refreshes source material without importing or overwriting community data.
    for (let i = 0; i < rows.length; i += 8) {
      const batch = rows.slice(i, i + 8);
      const vectors = await embedder.embed(batch.map(itemEmbeddingText));
      for (let j = 0; j < batch.length; j++) {
        const row = { ...batch[j], embedding: vectors[j], embeddingModel: embedder.name, embeddedAt: new Date() };
        await db.insert(items).values(row).onConflictDoUpdate({ target: [items.kind, items.slug], set: {
          description: row.description, readme: row.readme, name: row.name, url: row.url,
          topics: row.topics, license: row.license, archived: row.archived, pushedAt: row.pushedAt,
          embedding: row.embedding, embeddingModel: row.embeddingModel, embeddedAt: row.embeddedAt,
          updatedAt: new Date(),
        } });
      }
    }
    console.log(`${owner}/${repo}: ${rows.length} skills refreshed`);
  } catch (error) { failed = true; console.error(`${owner}/${repo}: ${(error as Error).message}`); }
}
process.exit(failed ? 1 : 0);
