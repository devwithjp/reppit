import { describe, expect, it } from "vitest";
import { localRuntimeEnv } from "./local-next";

describe("localRuntimeEnv", () => {
  it("cannot inherit stale hosted database credentials", () => {
    const env = localRuntimeEnv({
      DATABASE_URL: "postgres://deleted-host.example/db",
      POSTGRES_URL: "postgres://another-deleted-host.example/db",
      GITIT_AUTO_MIGRATE: "0",
      PGLITE_DIR: "/tmp/existing-choice",
      PATH: "/usr/bin",
    });

    expect(env.DATABASE_URL).toBe("");
    expect(env.POSTGRES_URL).toBe("");
    expect(env.GITIT_AUTO_MIGRATE).toBe("1");
    expect(env.PGLITE_DIR).toBe("/tmp/existing-choice");
    expect(env.PATH).toBe("/usr/bin");
  });
});
