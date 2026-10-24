import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
]);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = files.get(pathname);
  if (!file) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const content = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, { "Content-Type": file[1], "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error(`Unable to serve ${pathname}:`, error);
    response.writeHead(500).end("Unable to load the game");
  }
});
server.on("error", error => {
  console.error("Unable to start Farm Frenzy:", error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`Farm Frenzy is ready at http://${host}:${port}`));
