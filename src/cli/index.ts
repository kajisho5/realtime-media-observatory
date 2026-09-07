#!/usr/bin/env node
import { Command } from "commander";
import { assertValidPipeline } from "../model/index.js";
import { SYNTHETIC_FIXTURES, SyntheticAdapter, findFixture, runPipelineToCMM } from "../synthetic/index.js";
import { renderHuman } from "./render.js";

const program = new Command();

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
    const spec = findFixture(options.pipeline);
    if (!spec) {
      console.error(
        `Unknown pipeline "${options.pipeline}". Available: ${SYNTHETIC_FIXTURES.map((f) => f.id).join(", ")}`
      );
      process.exitCode = 1;
      return;
    }
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

await program.parseAsync(process.argv);
