import { describe, it, expect } from "vitest";
import { envConfig, slugPath, formatTrust, DEFAULT_API_URL } from "../src/client";

describe("envConfig", () => {
  it("defaults to reppit.dev", () => expect(envConfig({})).toEqual({ baseUrl: DEFAULT_API_URL, apiKey: undefined }));
  it("prefers REPPIT_* and falls back to GITIT_*", () => {
    expect(envConfig({ GITIT_API_URL: "http://old/", GITIT_API_KEY: "k1" })).toEqual({ baseUrl: "http://old", apiKey: "k1" });
    expect(envConfig({ REPPIT_API_URL: "http://new", GITIT_API_URL: "http://old", REPPIT_API_KEY: "k2", GITIT_API_KEY: "k1" })).toEqual({ baseUrl: "http://new", apiKey: "k2" });
  });
});
describe("helpers", () => {
  it("encodes slug segments but keeps slashes", () => expect(slugPath("a b/c?d")).toBe("a%20b/c%3Fd"));
  it("shows the API's trust number or says there is not enough data", () => {
    expect(formatTrust({ score: 87, base: 80, voteAdjust: 7, unknownCount: 0, cells: [] })).toBe("trust 87/100");
    expect(formatTrust({ score: null, reason: "not enough data", base: null, voteAdjust: 0, unknownCount: 3, cells: [] })).toBe("trust: not enough data");
  });
});
