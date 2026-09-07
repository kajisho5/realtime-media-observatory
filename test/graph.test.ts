import { describe, expect, it } from "vitest";
import { PipelineGraph, UnknownNodeError } from "../src/graph/pipelineGraph.js";
import { SYNTHETIC_FIXTURES, SyntheticAdapter, runPipelineToCMM } from "../src/synthetic/index.js";

describe("PipelineGraph", () => {
  it("builds a linear chain from a Pipeline's ordered stages", async () => {
    const spec = SYNTHETIC_FIXTURES.find((f) => f.id === "camera-to-display")!;
    const pipeline = await runPipelineToCMM(new SyntheticAdapter(spec), spec.name);
    const graph = PipelineGraph.fromPipeline(pipeline);

    expect(graph.nodes().map((n) => n.id)).toEqual(["capture", "buffer", "processing", "network"]);
    expect(graph.edges()).toEqual([
      { from: "capture", to: "buffer" },
      { from: "buffer", to: "processing" },
      { from: "processing", to: "network" }
    ]);
    expect(graph.sourceNodeIds()).toEqual(["capture"]);
    expect(graph.linearPath()).toEqual(["capture", "buffer", "processing", "network"]);
  });

  it("totalLatencyMs matches the CMM's own total_latency_ms for a linear pipeline", async () => {
    const spec = SYNTHETIC_FIXTURES.find((f) => f.id === "camera-to-display")!;
    const pipeline = await runPipelineToCMM(new SyntheticAdapter(spec), spec.name);
    const graph = PipelineGraph.fromPipeline(pipeline);
    expect(graph.totalLatencyMs()).toBe(38);
    expect(graph.totalLatencyMs()).toBe(pipeline.totalLatencyMeasurement?.value);
  });

  it("latencyContributions ranks the network stage as the largest contributor for the OBS-style fixture", async () => {
    const spec = SYNTHETIC_FIXTURES.find((f) => f.id === "obs-glass-to-glass")!;
    const pipeline = await runPipelineToCMM(new SyntheticAdapter(spec), spec.name);
    const graph = PipelineGraph.fromPipeline(pipeline);
    const contributions = graph.latencyContributions();

    expect(contributions[0]!.nodeId).toBe("network");
    expect(contributions[0]!.latencyMs).toBeCloseTo(31.4, 6);
    const totalShare = contributions.reduce((sum, c) => sum + c.sharePercent, 0);
    expect(totalShare).toBeCloseTo(100, 6);
  });

  it("addEdge throws UnknownNodeError for a node id not in the graph", () => {
    const graph = new PipelineGraph();
    graph.addNode({ id: "a", name: "a", measurements: [] });
    expect(() => graph.addEdge("a", "b")).toThrow(UnknownNodeError);
    expect(() => graph.addEdge("b", "a")).toThrow(UnknownNodeError);
  });

  it("linearPath throws on an empty graph with no explicit start", () => {
    const graph = new PipelineGraph();
    expect(() => graph.linearPath()).toThrow();
  });
});
