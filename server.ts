import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const files = new Map<string, readonly [string, string]>([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
  ["/ai.js", ["ai.js", "text/javascript; charset=utf-8"]],
  ["/ai-worker.js", ["ai-worker.js", "text/javascript; charset=utf-8"]],
  ["/auto-fill.js", ["auto-fill.js", "text/javascript; charset=utf-8"]],
]);
const { PORT = "3000", HOST = "127.0.0.1" } = process.env;
const port = Number(PORT || "3000");
const host = HOST || "127.0.0.1";
const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const file = files.get(pathname);
  if (!file) {
    response.writeHead(404).end("Not found");
    return;
  }
  readFile(new URL(file[0], import.meta.url)).then(content => {
    response.writeHead(200, { "Content-Type": file[1], "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : content);
  }).catch((error: unknown) => {
    console.error(`Unable to serve ${pathname}:`, error);
    response.writeHead(500).end("Unable to load the game");
  });
});
server.on("error", error => {
  console.error("Unable to start Farm Frenzy:", error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => { console.log(`Farm Frenzy is ready at http://${host}:${port}`); });
