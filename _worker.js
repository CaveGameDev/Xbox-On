/* Cloudflare Pages worker (advanced mode).

   Why this exists: Pages answers a Range request with the whole file - no
   Content-Range, no Accept-Ranges, for a 490 byte script as much as for a
   9.6 MB part. The client asks for hundreds of small ranges spread over 70
   parts, so on Pages each of those turned into a full part download and a cold
   boot pulled roughly three times the bytes it actually needed.

   This worker serves ranges itself: the asset is read once at the edge, kept in
   the edge cache, and only the bytes that were asked for go down the wire. It
   also stamps the cross-origin isolation headers on the boot page, which
   _headers cannot do once a worker owns the response.

   Deleting this file puts Pages back on plain static serving. */

const ISOLATION = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Resource-Policy": "same-origin"
};

const BOOT_PATHS = new Set(["/api/disc/boot", "/api/disc/boot.html"]);
const CACHE_MAX_AGE = 86400;          // edge copy of a part
const STORE_MAX = 24 << 20;           // do not hold an asset bigger than this

/* one read per asset per isolate, even when several lanes ask at once */
const reads = new Map();

function readOnce(env, key) {
  const id = key.url;
  if (reads.has(id)) return reads.get(id);
  const job = (async () => {
    const cache = caches.default;
    const cached = await cache.match(key);
    if (cached) return { bytes: new Uint8Array(await cached.arrayBuffer()), type: cached.headers.get("Content-Type") || "application/octet-stream" };
    const asset = await env.ASSETS.fetch(key);
    if (!asset.ok) return null;
    const buffer = await asset.arrayBuffer();
    const type = asset.headers.get("Content-Type") || "application/octet-stream";
    const bytes = new Uint8Array(buffer);
    if (bytes.length <= STORE_MAX) {
      await cache.put(key, new Response(buffer, {
        headers: { "Content-Type": type, "Cache-Control": "public, max-age=" + CACHE_MAX_AGE }
      })).catch(() => {});
    }
    return { bytes, type };
  })().finally(() => reads.delete(id));
  reads.set(id, job);
  return job;
}

function parseRange(header) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match) return null;
  const [, from, to] = match;
  if (from === "" && to === "") return null;
  return { from: from === "" ? null : Number(from), to: to === "" ? null : Number(to) };
}

async function serveRange(request, env, url) {
  const range = parseRange(request.headers.get("Range"));
  if (!range) return null;

  const key = new Request(url.origin + url.pathname, { method: "GET" });
  const held = await readOnce(env, key);
  if (!held) return null;

  const total = held.bytes.length;
  const start = range.from === null ? Math.max(0, total - range.to) : range.from;
  const end = range.from === null || range.to === null ? total - 1 : Math.min(range.to, total - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= total || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + total, "Accept-Ranges": "bytes" } });
  }

  const slice = held.bytes.subarray(start, end + 1);
  const headers = {
    "Content-Type": held.type,
    "Content-Range": "bytes " + start + "-" + end + "/" + total,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=" + CACHE_MAX_AGE
  };
  return new Response(request.method === "HEAD" ? null : slice, { status: 206, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (BOOT_PATHS.has(url.pathname)) {
      const page = await env.ASSETS.fetch(new Request(url.origin + "/api/disc/boot.html"));
      const headers = new Headers(page.headers);
      for (const [name, value] of Object.entries(ISOLATION)) headers.set(name, value);
      headers.set("Cache-Control", "no-store");
      return new Response(request.method === "HEAD" ? null : page.body, {
        status: page.status,
        statusText: page.statusText,
        headers
      });
    }

    if ((request.method === "GET" || request.method === "HEAD") && request.headers.get("Range")) {
      const partial = await serveRange(request, env, url);
      if (partial) return partial;
    }

    const asset = await env.ASSETS.fetch(request);
    if (url.pathname === "/api/disc/site.bin") {
      const headers = new Headers(asset.headers);
      headers.set("Cache-Control", "no-cache");
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }
    return asset;
  }
};
