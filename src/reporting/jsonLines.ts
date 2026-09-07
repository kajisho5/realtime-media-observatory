/**
 * Reporting: JSON Lines output.
 *
 * Newline-delimited, CMM-schema-conformant JSON — one Pipeline report per
 * line, suitable for piping into `jq`, a log aggregator, or any streaming
 * JSON consumer.
 */
import type { Pipeline } from "../model/types.js";

export function toJsonLine(pipeline: Pipeline): string {
  return JSON.stringify(pipeline);
}

export interface JsonLinesEmitter {
  write(pipeline: Pipeline): void;
}

/** Wraps a writable stream (e.g. process.stdout) as a JSON Lines emitter. */
export function createStreamJsonLinesEmitter(stream: NodeJS.WritableStream): JsonLinesEmitter {
  return {
    write(pipeline: Pipeline): void {
      stream.write(`${toJsonLine(pipeline)}\n`);
    }
  };
}

/** In-memory emitter useful for tests: collects each line written. */
export function createCollectingJsonLinesEmitter(): JsonLinesEmitter & { lines(): readonly string[] } {
  const lines: string[] = [];
  return {
    write(pipeline: Pipeline): void {
      lines.push(toJsonLine(pipeline));
    },
    lines(): readonly string[] {
      return lines;
    }
  };
}
