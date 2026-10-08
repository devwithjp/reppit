import { describe, it, expect } from "vitest";
import { LocalEmbedder, cosine, itemEmbeddingText, normalizeQueryForTest } from "./helpers";

describe("LocalEmbedder", () => {
  const e = new LocalEmbedder();
  it("is deterministic and unit-length", async () => {
    const [a] = await e.embed(["parse pdf tables in python"]);
    const [b] = await e.embed(["parse pdf tables in python"]);
    expect(a).toEqual(b);
    expect(Math.sqrt(a.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 6);
  });
  it("puts related text closer than unrelated text", async () => {
    const [q, pdf, web] = await e.embed([
      "extract tables from pdf files in python",
      itemEmbeddingText({ name: "pdfplumber", description: "Plumb a PDF for detailed information about each char, rectangle, line, and table.", topics: ["pdf", "python", "table-extraction"], language: "Python", readme: "pdfplumber extracts text and tables from PDF files" }),
      itemEmbeddingText({ name: "express", description: "Fast, unopinionated, minimalist web framework for node.", topics: ["javascript", "http", "server"], language: "JavaScript", readme: "web framework for node http routing middleware" }),
    ]);
    expect(cosine(q, pdf)).toBeGreaterThan(cosine(q, web));
  });
});
