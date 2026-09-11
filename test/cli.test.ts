import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { validatePipeline } from "../src/model/validate.js";

const CLI_ENTRY = "src/cli/index.ts";

function runCli(args: string[]): string {
  return execFileSync("npx", ["tsx", CLI_ENTRY, ...args], { encoding: "utf8" });
}

describe("realtime-observe CLI", () => {
  it("--json prints output that validates against the CMM schema", () => {
    const output = runCli(["run", "--json"]);
    const parsed = JSON.parse(output);
    const result = validatePipeline(parsed);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(parsed.totalLatencyMeasurement.value).toBe(38);
  });

  it("default human-readable output is pipeline-first, not a log dump", () => {
    const output = runCli(["run"]);
    expect(output).toContain("TOTAL LATENCY");
    expect(output).toContain("PIPELINE");
    expect(output).toContain("capture");
  });

  it("list prints the available synthetic fixtures", () => {
    const output = runCli(["list"]);
    expect(output).toContain("camera-to-display");
    expect(output).toContain("obs-glass-to-glass");
    expect(output).toContain("audio-round-trip");
  });

  it("--pipeline selects a specific fixture", () => {
    const output = runCli(["run", "--json", "--pipeline", "audio-round-trip"]);
    const parsed = JSON.parse(output);
    expect(parsed.name).toBe("audio-round-trip");
    expect(parsed.totalLatencyMeasurement.value).toBeCloseTo(6.5, 6);
  });
});
