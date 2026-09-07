/**
 * Pipeline Graph Model.
 *
 * Represents a realtime media pipeline as a graph — nodes carrying
 * measurements, edges carrying flow — so the CLI, a future dashboard, and
 * external/AI-agent consumers can ask topology-aware questions ("which
 * stage contributes most to total latency") instead of parsing a flat
 * measurement list.
 *
 * The Common Measurement Model's `Pipeline.stages` is currently a flat,
 * ordered list (no branching), so `fromPipeline()` builds a linear chain:
 * each stage is a node, connected in array order. The node/edge structure
 * itself is generic and not limited to linear chains, so it can represent
 * branching pipelines once the CMM gains that concept.
 */
import type { Measurement, Pipeline } from "../model/types.js";

export interface PipelineGraphNode {
  readonly id: string;
  readonly name: string;
  readonly measurements: readonly Measurement[];
}

export interface PipelineGraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface LatencyContribution {
  readonly nodeId: string;
  readonly name: string;
  readonly latencyMs: number;
  /** Share of the sum of all node latencies in this graph, 0-100. 0 if the graph has no latency at all. */
  readonly sharePercent: number;
}

export class UnknownNodeError extends Error {
  constructor(nodeId: string) {
    super(`No node with id "${nodeId}" in this graph`);
    this.name = "UnknownNodeError";
  }
}

export class PipelineGraph {
  private readonly nodesById = new Map<string, PipelineGraphNode>();
  private readonly outgoing = new Map<string, string[]>();
  private readonly hasIncoming = new Set<string>();

  /** Builds a linear-chain graph from a Common Measurement Model Pipeline's ordered stages. */
  static fromPipeline(pipeline: Pipeline): PipelineGraph {
    const graph = new PipelineGraph();
    for (const stage of pipeline.stages) {
      graph.addNode({ id: stage.id, name: stage.name, measurements: stage.measurements });
    }
    for (let i = 0; i < pipeline.stages.length - 1; i += 1) {
      graph.addEdge(pipeline.stages[i]!.id, pipeline.stages[i + 1]!.id);
    }
    return graph;
  }

  addNode(node: PipelineGraphNode): void {
    this.nodesById.set(node.id, node);
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, []);
  }

  addEdge(from: string, to: string): void {
    if (!this.nodesById.has(from)) throw new UnknownNodeError(from);
    if (!this.nodesById.has(to)) throw new UnknownNodeError(to);
    this.outgoing.get(from)!.push(to);
    this.hasIncoming.add(to);
  }

  nodes(): readonly PipelineGraphNode[] {
    return [...this.nodesById.values()];
  }

  node(id: string): PipelineGraphNode | undefined {
    return this.nodesById.get(id);
  }

  edges(): readonly PipelineGraphEdge[] {
    const result: PipelineGraphEdge[] = [];
    for (const [from, tos] of this.outgoing) {
      for (const to of tos) result.push({ from, to });
    }
    return result;
  }

  /** Node ids with no incoming edge — candidate starting points for a traversal. */
  sourceNodeIds(): readonly string[] {
    return this.nodes()
      .map((n) => n.id)
      .filter((id) => !this.hasIncoming.has(id));
  }

  private latencyOf(node: PipelineGraphNode): number {
    return node.measurements.find((m) => m.name === "latency_ms")?.value ?? 0;
  }

  /**
   * Follows outgoing edges from `startId` (default: the first source node)
   * as a linear chain, returning the ordered node ids visited. Stops if a
   * node has no outgoing edge or more than one (branching is not yet
   * representable as a single path); throws if the graph is empty and no
   * `startId` is given.
   */
  linearPath(startId?: string): string[] {
    const start = startId ?? this.sourceNodeIds()[0];
    if (start === undefined) {
      throw new Error("Cannot compute a linear path: graph has no nodes (or no source node) to start from");
    }
    const path = [start];
    let current = start;
    for (;;) {
      const next = this.outgoing.get(current) ?? [];
      if (next.length !== 1) break;
      current = next[0]!;
      path.push(current);
    }
    return path;
  }

  /** Sum of `latency_ms` across every node in the graph. */
  totalLatencyMs(): number {
    return this.nodes().reduce((sum, n) => sum + this.latencyOf(n), 0);
  }

  /** Each node's latency and its share of the graph's total latency, sorted by largest contributor first. */
  latencyContributions(): LatencyContribution[] {
    const total = this.totalLatencyMs();
    return this.nodes()
      .map((n) => {
        const latencyMs = this.latencyOf(n);
        return {
          nodeId: n.id,
          name: n.name,
          latencyMs,
          sharePercent: total === 0 ? 0 : (latencyMs / total) * 100
        };
      })
      .sort((a, b) => b.latencyMs - a.latencyMs);
  }
}
