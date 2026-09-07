#!/usr/bin/env node
/**
 * Stand-in for a real VST3/AU plugin: connects to VstPluginAdapter's
 * listener and sends one report message, per
 * docs/architecture/vst-au-reporting-protocol.md. Use this to manually
 * exercise `realtime-observe vst-listen` without a real DAW/plugin.
 *
 * Usage: node scripts/demo-vst-client.mjs --port 9400
 */
import { connect } from "node:net";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 9400;

const report = {
  type: "report",
  sampleRate: 48000,
  bufferSize: 128,
  inputLatencyMs: 2.7,
  processingLatencyMs: 1.4,
  outputLatencyMs: 2.7,
  xrun: false
};

const socket = connect(port, "127.0.0.1", () => {
  socket.write(`${JSON.stringify(report)}\n`);
  console.log(`demo-vst-client: sent report to tcp://127.0.0.1:${port}`, report);
  socket.end();
});

socket.on("error", (err) => {
  console.error(`demo-vst-client: failed to connect to tcp://127.0.0.1:${port}:`, err.message);
  process.exit(1);
});
