import { describe, expect, it } from "vitest";
import { getSafeNext } from "@/lib/auth";

describe("getSafeNext", () => {
  it("returns fallback for null next", () => {
    expect(getSafeNext(null, "/agentguard")).toBe("/agentguard");
  });

  it("accepts internal routes", () => {
    expect(getSafeNext("/agentguard/settings", "/agentguard")).toBe("/agentguard/settings");
  });

  it("rejects absolute external url", () => {
    expect(getSafeNext("https://evil.example", "/agentguard")).toBe("/agentguard");
  });
});
