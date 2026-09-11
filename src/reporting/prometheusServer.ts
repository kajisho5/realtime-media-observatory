import { createServer, type Server } from "node:http";
import type { Pipeline } from "../model/types.js";
import { toPrometheusExposition } from "./prometheus.js";

export interface PrometheusHttpServer {
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

/** Serves the most recently supplied Pipeline as Prometheus text exposition at GET /metrics. `getPipeline` is called fresh on every scrape. */
export function startPrometheusServer(port: number, getPipeline: () => Pipeline | undefined): Promise<PrometheusHttpServer> {
  const server: Server = createServer((req, res) => {
    if ((req.url ?? "").split("?")[0] !== "/metrics") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found. Try GET /metrics\n");
      return;
    }
    const pipeline = getPipeline();
    if (!pipeline) {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("No pipeline data yet\n");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
    res.end(toPrometheusExposition(pipeline));
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : port;
      resolve({
        port: actualPort,
        url: `http://localhost:${actualPort}/metrics`,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          })
      });
    });
  });
}
