/* Host for this folder.

   api/disc/boot.html is the isolated entry point the disc opens: it is served
   with the cross-origin isolation headers the game needs, and its shell unpacks
   game.html out of api/disc/site.bin. Everything else in this folder is served
   as-is (index.html at /).

   `node server.js [port]` hosts it locally; the default export is the Worker. */

const BOOT_PATH = "/api/disc/boot.html";
const ISOLATION = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless"
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream"
};

function withIsolation(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(ISOLATION)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    if (env && env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      return new URL(request.url).pathname === BOOT_PATH ? withIsolation(response) : response;
    }
    return new Response("Not found", { status: 404 });
  }
};

/* `node server.js` hosts this folder locally. */
async function serveLocal() {
  const { createServer } = await import("node:http");
  const { createReadStream } = await import("node:fs");
  const { stat } = await import("node:fs/promises");
  const { extname, join, sep } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const root = fileURLToPath(new URL(".", import.meta.url));
  const prefix = root.endsWith(sep) ? root : root + sep;
  const port = Number(process.argv[2] || process.env.PORT || 8787);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));

    if (url.pathname === "/api/play-session") {
      const body = JSON.stringify({ verified: true });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body) });
      res.end(body);
      return;
    }

    let rel;
    try {
      rel = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname).replace(/^\/+/, "");
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }
    const file = join(root, rel);
    if (!file.startsWith(prefix) && file !== root) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error("not a file");
      const headers = {
        "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": url.pathname === BOOT_PATH ? "no-store" : "no-cache"
      };
      if (url.pathname === BOOT_PATH) Object.assign(headers, ISOLATION);
      res.writeHead(200, headers);
      if (req.method === "HEAD") res.end();
      else createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log("hosting this folder on http://127.0.0.1:" + port + "/");
    console.log("game boots at  http://127.0.0.1:" + port + "/api/disc/boot.html");
  });
}

if (typeof process !== "undefined" && process.argv && process.argv[1] && /server\.js$/.test(process.argv[1])) serveLocal();
