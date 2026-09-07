#!/usr/bin/env node
import { Command } from "commander";
import { NetworkAdapter, ObsAdapter, VstPluginAdapter } from "../adapter/index.js";
import { assertValidPipeline } from "../model/index.js";
import { createStreamJsonLinesEmitter, exportPipelineAsSpans, startPipelineWebSocketServer, startPrometheusServer } from "../reporting/index.js";
import { SYNTHETIC_FIXTURES, SyntheticAdapter, findFixture, runPipelineToCMM, type SyntheticPipelineSpec } from "../synthetic/index.js";
import { defaultDashboardDir, startDashboardHttpServer } from "./dashboardServer.js";
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

program
  .command("dashboard")
  .description(
    "Start the pipeline-first web dashboard: a WebSocket broadcast server plus a static file server for " +
      "dashboard/. Open the printed URL in a browser. Ctrl+C to stop."
  )
  .option("--pipeline <id>", "id of the synthetic fixture to run", SYNTHETIC_FIXTURES[0]!.id)
  .option("--interval-ms <ms>", "interval between broadcasts, in ms", "1000")
  .option("--port <port>", "HTTP port for the dashboard page", "8080")
  .option("--ws-port <port>", "WebSocket port for live data (0 = OS-assigned)", "8787")
  .action(async (options: { pipeline: string; intervalMs: string; port: string; wsPort: string }) => {
    const spec = resolveFixtureOrExit(options.pipeline);
    const intervalMs = Number(options.intervalMs);
    const wsServer = await startPipelineWebSocketServer(Number(options.wsPort));
    const httpServer = await startDashboardHttpServer(Number(options.port), defaultDashboardDir());

    console.error(`realtime-observe: dashboard at ${httpServer.url}/?ws=ws://localhost:${wsServer.port}`);
    console.error(`realtime-observe: broadcasting "${spec.id}" every ${intervalMs}ms on ws://localhost:${wsServer.port}`);

    const timer = setInterval(() => {
      void runPipelineToCMM(new SyntheticAdapter(spec), spec.name).then((pipeline) => {
        assertValidPipeline(pipeline);
        wsServer.broadcast(pipeline);
      });
    }, intervalMs);

    installSigintStop(async () => {
      clearInterval(timer);
      await Promise.all([wsServer.close(), httpServer.close()]);
    });
  });

program
  .command("probe-network")
  .description("Measure TCP connect round-trip time to a real host:port as a 'network' stage and print a report.")
  .requiredOption("--host <host>", "target hostname or IP")
  .requiredOption("--port <port>", "target port")
  .option("--json", "print machine-readable JSON instead of the human-readable summary")
  .option("--timeout-ms <ms>", "connect timeout, in ms", "5000")
  .action(async (options: { host: string; port: string; json?: boolean; timeoutMs: string }) => {
    const adapter = new NetworkAdapter({ host: options.host, port: Number(options.port), timeoutMs: Number(options.timeoutMs) });
    const pipeline = await runPipelineToCMM(adapter, `network-probe:${options.host}:${options.port}`);
    assertValidPipeline(pipeline);
    console.log(options.json ? JSON.stringify(pipeline, null, 2) : renderHuman(pipeline));
  });

program
  .command("obs")
  .description(
    "Connect to a running OBS instance via obs-websocket v5 and print a report from GetStats. " +
      "Protocol-tested against a mock server; not yet run against real OBS (see issue #13)."
  )
  .option("--url <url>", "obs-websocket server URL", "ws://localhost:4455")
  .option("--json", "print machine-readable JSON instead of the human-readable summary")
  .action(async (options: { url: string; json?: boolean }) => {
    const adapter = new ObsAdapter({ url: options.url });
    const pipeline = await runPipelineToCMM(adapter, "obs-pipeline");
    assertValidPipeline(pipeline);
    console.log(options.json ? JSON.stringify(pipeline, null, 2) : renderHuman(pipeline));
  });

program
  .command("metrics")
  .description("Start a Prometheus-compatible /metrics HTTP endpoint, refreshed on an interval. Ctrl+C to stop.")
  .option("--pipeline <id>", "id of the synthetic fixture to run", SYNTHETIC_FIXTURES[0]!.id)
  .option("--interval-ms <ms>", "interval between refreshes, in ms", "1000")
  .option("--port <port>", "port to listen on (0 = OS-assigned)", "9464")
  .action(async (options: { pipeline: string; intervalMs: string; port: string }) => {
    const spec = resolveFixtureOrExit(options.pipeline);
    const intervalMs = Number(options.intervalMs);
    let latest = await runPipelineToCMM(new SyntheticAdapter(spec), spec.name);
    const server = await startPrometheusServer(Number(options.port), () => latest);
    console.error(`realtime-observe: Prometheus endpoint at ${server.url}`);

    const timer = setInterval(() => {
      void runPipelineToCMM(new SyntheticAdapter(spec), spec.name).then((pipeline) => {
        assertValidPipeline(pipeline);
        latest = pipeline;
      });
    }, intervalMs);

    installSigintStop(async () => {
      clearInterval(timer);
      await server.close();
    });
  });

program
  .command("otel")
  .description("Run a pipeline and export it as an OpenTelemetry trace (one root span + one span per stage) to the console.")
  .option("--pipeline <id>", "id of the synthetic fixture to run", SYNTHETIC_FIXTURES[0]!.id)
  .action(async (options: { pipeline: string }) => {
    const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
    const { ConsoleSpanExporter, SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
    const spec = resolveFixtureOrExit(options.pipeline);
    const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())] });
    const pipeline = await runPipelineToCMM(new SyntheticAdapter(spec), spec.name);
    assertValidPipeline(pipeline);
    exportPipelineAsSpans(pipeline, provider.getTracer("realtime-observe-cli"));
    await provider.shutdown();
  });

program
  .command("vst-listen")
  .description(
    "Listen for one report from a VST3/AU plugin over the local reporting protocol " +
      "(docs/architecture/vst-au-reporting-protocol.md) and print it as a pipeline report. " +
      "No native plugin ships with this project (#14); try it with scripts/demo-vst-client.mjs."
  )
  .option("--port <port>", "port to listen on (0 = OS-assigned)", "9400")
  .option("--json", "print machine-readable JSON instead of the human-readable summary")
  .action(async (options: { port: string; json?: boolean }) => {
    const adapter = new VstPluginAdapter({ port: Number(options.port) });
    const port = await adapter.listen();
    console.error(`realtime-observe: waiting for one VST/AU plugin report on tcp://localhost:${port} ...`);
    const pipeline = await runPipelineToCMM(adapter, "vst-plugin");
    assertValidPipeline(pipeline);
    console.log(options.json ? JSON.stringify(pipeline, null, 2) : renderHuman(pipeline));
  });

await program.parseAsync(process.argv);
