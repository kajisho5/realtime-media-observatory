/**
 * Minimal static file server for the dashboard/ directory. No framework
 * dependency — the dashboard is 3 static files, so Node's `http` module
 * is enough.
 */
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

export interface DashboardHttpServer {
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

export function startDashboardHttpServer(port: number, dashboardDir: string): Promise<DashboardHttpServer> {
  const server: Server = createServer((req, res) => {
    void (async () => {
      const pathOnly = (req.url ?? "/").split("?")[0]!;
      const requestPath = pathOnly === "/" ? "/index.html" : pathOnly;
      const filePath = normalize(join(dashboardDir, requestPath));
      if (!filePath.startsWith(normalize(dashboardDir))) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      try {
        const data = await readFile(filePath);
        res.writeHead(200, { "content-type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    })();
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : port;
      resolve({
        port: actualPort,
        url: `http://localhost:${actualPort}`,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          })
      });
    });
  });
}

/** Resolves the dashboard/ directory relative to this module, regardless of whether it's run via tsx (src/) or the compiled build (dist/). */
export function defaultDashboardDir(): string {
  return fileURLToPath(new URL("../../dashboard", import.meta.url));
}
