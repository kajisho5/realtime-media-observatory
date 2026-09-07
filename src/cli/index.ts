#!/usr/bin/env node
import { Command } from "commander";
import { assertValidPipeline } from "../model/index.js";
import { createStreamJsonLinesEmitter, startPipelineWebSocketServer } from "../reporting/index.js";
import { SYNTHETIC_FIXTURES, SyntheticAdapter, findFixture, runPipelineToCMM, type SyntheticPipelineSpec } from "../synthetic/index.js";
import { renderHuman } from "./render.js";

const program = new Command();

function resolveFixtureOrExit(id: string): SyntheticPipelineSpec {
  const spec = findFixture(id);
  if (!spec) {
    console.error(`Unknown pipeline "${id}". Available: ${SYNTHETIC_FIXTURES.map((f) => f.id).join(", ")}`);
    process.exit(1);
  }
  return spec;
}

function installSigintStop(stop: () => void | Promise<void>): void {
  process.on("SIGINT", () => {
    void Promise.resolve(stop()).finally(() => process.exit(0));
  });
}

program
  .name("realtime-observe")
  .description(
    "Realtime Media Observatory CLI. Observes a realtime media pipeline and reports latency, jitter, " +
      "buffering, drops, XRUN, and clock drift as a Common-Measurement-Model report."
  )
  .version("0.1.0");

program
  .command("run", { isDefault: true })
  .description("Run a pipeline (defaults to the first synthetic fixture) and print a report.")
  .option("--json", "print machine-readable JSON (validated against the CMM schema) instead of the human-readable summary")
  .option("--pipeline <id>", "id of the synthetic fixture to run", SYNTHETIC_FIXTURES[0]!.id)
  .action(async (options: { json?: boolean; pipeline: string }) => {
    const spec = resolveFixtureOrExit(options.pipeline);
    const adapter = new SyntheticAdapter(spec);
    const pipeline = await runPipelineToCMM(adapter, spec.name);
    assertValidPipeline(pipeline);
    if (options.json) {
      console.log(JSON.stringify(pipeline, null, 2));
    } else {
      console.log(renderHuman(pipeline));
    }
  });

program
  .command("list")
  .description("List available synthetic pipeline fixtures.")
  .action(() => {
    for (const fixture of SYNTHETIC_FIXTURES) {
      console.log(`${fixture.id}\t(${fixture.stages.length} stages)`);
    }
  });

program
  .command("stream")
  .description("Continuously run a pipeline and stream NDJSON (JSON Lines) reports to stdout. Ctrl+C to stop.")
  .option("--pipeline <id>", "id of the synthetic fixture to run", SYNTHETIC_FIXTURES[0]!.id)
  .option("--interval-ms <ms>", "interval between reports, in ms", "1000")
  .action(async (options: { pipeline: string; intervalMs: string }) => {
    const spec = resolveFixtureOrExit(options.pipeline);
    const intervalMs = Number(options.intervalMs);
    const emitter = createStreamJsonLinesEmitter(process.stdout);

    async function tick(): Promise<void> {
      const pipeline = await runPipelineToCMM(new SyntheticAdapter(spec), spec.name);
      assertValidPipeline(pipeline);
      emitter.write(pipeline);
    }

    await tick();
    const timer = setInterval(() => void tick(), intervalMs);
    installSigintStop(() => clearInterval(timer));
  });

program
  .command("serve")
  .description("Start a WebSocket server broadcasting live pipeline reports on an interval. Ctrl+C to stop.")
  .option("--pipeline <id>", "id of the synthetic fixture to run", SYNTHETIC_FIXTURES[0]!.id)
  .option("--interval-ms <ms>", "interval between broadcasts, in ms", "1000")
  .option("--port <port>", "port to listen on (0 = OS-assigned)", "8787")
  .action(async (options: { pipeline: string; intervalMs: string; port: string }) => {
    const spec = resolveFixtureOrExit(options.pipeline);
    const intervalMs = Number(options.intervalMs);
    const server = await startPipelineWebSocketServer(Number(options.port));
    console.error(`realtime-observe: WebSocket server listening on ws://localhost:${server.port}`);

    const timer = setInterval(() => {
      void runPipelineToCMM(new SyntheticAdapter(spec), spec.name).then((pipeline) => {
        assertValidPipeline(pipeline);
        server.broadcast(pipeline);
      });
    }, intervalMs);

    installSigintStop(async () => {
      clearInterval(timer);
      await server.close();
    });
  });

await program.parseAsync(process.argv);
