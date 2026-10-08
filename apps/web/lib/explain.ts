import Anthropic from "@anthropic-ai/sdk";
import type { SearchResult } from "@gitit/core";

/**
 * One-line "why" per result, written by Claude when ANTHROPIC_API_KEY is set.
 * Falls back to the template explanation from @gitit/core otherwise or on any error.
 * Cost: a few hundred output tokens per query; results are cached by normalised query upstream.
 */
export async function explainWithClaude(query: string, results: SearchResult[]): Promise<SearchResult[]> {
  if (!process.env.ANTHROPIC_API_KEY || results.length === 0) return results;
  const client = new Anthropic();
  const model = process.env.GITIT_EXPLAIN_MODEL ?? "claude-opus-5";
  const facts = results.map((r, i) => ({
    n: i + 1, slug: r.item.slug, kind: r.item.kind, description: r.item.description, language: r.item.language,
    stars: r.item.stars, installs: r.item.installs, netVotes: r.item.upvotes - r.item.downvotes, health: r.item.healthScore,
    downvoteReasons: r.downvoteReasons, compat: r.compat, semanticMatch: r.semantic, templateWhy: r.why,
  }));
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: [{
        type: "text",
        text: "You write one-line recommendations for a developer tool directory. For each candidate you receive facts: community votes, downvote reason tags, maintenance health (0-1), per-agent compatibility reports, popularity and semantic match. Write one sentence (max 25 words) per candidate explaining why it fits the user's problem, citing only the given facts. Mention insecure/unmaintained flags or 'broken on <agent>' reports when present. Never invent features. Reply with a JSON array of strings in candidate order and nothing else.",
        cache_control: { type: "ephemeral" },
      }],
      messages: [{ role: "user", content: `Problem: ${query}\n\nCandidates:\n${JSON.stringify(facts)}` }],
    });
    if (res.stop_reason === "refusal") return results;
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as string[];
    if (!Array.isArray(arr)) return results;
    return results.map((r, i) => (typeof arr[i] === "string" && arr[i].length > 0 ? { ...r, why: arr[i] } : r));
  } catch (e) {
    console.warn("explainWithClaude failed, using template:", (e as Error).message);
    return results;
  }
}
