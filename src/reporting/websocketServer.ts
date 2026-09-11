/**
 * Reporting: WebSocket streaming.
 *
 * Broadcasts CMM-schema-conformant Pipeline reports to every connected
 * WebSocket client — the live-data source for a future Dashboard (#18)
 * and any other external consumer that wants a push feed rather than
 * polling the CLI.
 */
import { WebSocketServer } from "ws";
import type { Pipeline } from "../model/types.js";

export interface PipelineWebSocketServer {
  readonly port: number;
  readonly clientCount: number;
  broadcast(pipeline: Pipeline): void;
  close(): Promise<void>;
}

/** Starts a WebSocket server that broadcasts Pipeline reports to all connected clients. Pass port 0 for an OS-assigned free port (useful in tests). */
export function startPipelineWebSocketServer(port = 0): Promise<PipelineWebSocketServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port });

    wss.once("error", reject);
    wss.once("listening", () => {
      wss.off("error", reject);
      const address = wss.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : port;

      const server: PipelineWebSocketServer = {
        port: actualPort,
        get clientCount() {
          return wss.clients.size;
        },
        broadcast(pipeline: Pipeline): void {
          const payload = JSON.stringify(pipeline);
          for (const client of wss.clients) {
            if (client.readyState === client.OPEN) client.send(payload);
          }
        },
        close(): Promise<void> {
          return new Promise((res, rej) => {
            wss.close((err) => (err ? rej(err) : res()));
          });
        }
      };
      resolve(server);
    });
  });
}
