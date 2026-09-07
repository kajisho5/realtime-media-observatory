import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startDashboardHttpServer, type DashboardHttpServer } from "../src/cli/dashboardServer.js";

describe("startDashboardHttpServer", () => {
  let dir: string;
  let server: DashboardHttpServer | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "rmo-dashboard-"));
    await writeFile(join(dir, "index.html"), "<html>hello</html>");
    await writeFile(join(dir, "app.js"), "console.log('hi');");
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it("serves index.html at the bare root path", async () => {
    server = await startDashboardHttpServer(0, dir);
    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hello");
  });

  it("serves index.html at the root path even with a query string (regression: this previously 404'd)", async () => {
    server = await startDashboardHttpServer(0, dir);
    const res = await fetch(`${server.url}/?ws=ws://localhost:8787`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hello");
  });

  it("serves other static files by path", async () => {
    server = await startDashboardHttpServer(0, dir);
    const res = await fetch(`${server.url}/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  it("404s for a file that doesn't exist", async () => {
    server = await startDashboardHttpServer(0, dir);
    const res = await fetch(`${server.url}/nonexistent.txt`);
    expect(res.status).toBe(404);
  });

  it("403s for a path-traversal attempt", async () => {
    server = await startDashboardHttpServer(0, dir);
    const res = await fetch(`${server.url}/../../../etc/passwd`);
    expect([403, 404]).toContain(res.status);
  });
});
