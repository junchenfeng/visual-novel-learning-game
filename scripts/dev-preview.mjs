#!/usr/bin/env node
/**
 * Dev reverse proxy for Next.js behind an HTTPS edge / iframe preview.
 *
 * Public port: DEPLOY_RUN_PORT (default 3000)
 * Internal next: public + 1
 *
 * Rewrites:
 *  1) Buffer HTML and strip `async` from /_next chunk scripts
 *  2) Patch Flight `hasReadable` and skip debug-channel HTTP-cache restore
 *     so hydrate does not wait for binary WebSocket frames / IndexedDB
 *     reloads dropped or misdetected by some edge proxies
 *  3) Bridge HMR WebSocket including binary frames
 *  4) Short-TTL cache + prefetch of /_next/static assets
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import net from "node:net";
import zlib from "node:zlib";
import { promisify } from "node:util";

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const brotliDecompress = promisify(zlib.brotliDecompress);

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const PUBLIC_PORT = Number(process.env.DEPLOY_RUN_PORT || 3000);
const INTERNAL_PORT = PUBLIC_PORT + 1;
const HOST = "127.0.0.1";
const CACHE_TTL_MS = 8_000;

const JS_PATCHES = [
  {
    label: "flight hydration",
    from: "hasReadable: void 0 !== options.debugChannel.readable",
    to: "hasReadable: !1",
  },
  // Coze CDN / iframe often reports responseStart=0, which Next treats as
  // HTTP-cache restore. Missing IndexedDB debug chunks then call location.reload()
  // and leave a never-closing stream, so hydrate never attaches click handlers.
  {
    label: "debug channel cache restore",
    from: "if (!requestHeaders) {\n        switch(wasServedFromCacheKnownAtExec(getNavigationEntry())){",
    to: "if (!1) {\n        switch(wasServedFromCacheKnownAtExec(getNavigationEntry())){",
  },
];

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

const DROP_WHEN_REWRITING = new Set([
  ...HOP_BY_HOP,
  "content-encoding",
  "content-length",
]);

/** @type {Map<string, { status: number, headers: http.OutgoingHttpHeaders, body: Buffer, expires: number }>} */
const staticCache = new Map();

function log(...args) {
  console.log("[dev-preview]", ...args);
}

function applyJsPatches(body) {
  let text = body.toString("utf-8");
  /** @type {string[]} */
  const applied = [];
  for (const patch of JS_PATCHES) {
    if (!text.includes(patch.from)) {
      continue;
    }
    text = text.split(patch.from).join(patch.to);
    applied.push(patch.label);
  }
  return {
    body: applied.length > 0 ? Buffer.from(text) : body,
    applied,
  };
}

function stripChunkAsync(html) {
  return html.replace(/<script\b([^>]*)>/gi, (full, attrs) => {
    if (!/\/_next\//i.test(attrs)) {
      return full;
    }
    const cleaned = String(attrs).replace(/\s+async(?:\s*=\s*(?:""|''|"async"|'async'|async))?|\s+async\b/gi, "");
    return `<script${cleaned}>`;
  });
}

function extractStaticPaths(html) {
  const paths = new Set();
  const re = /\/_next\/static\/[^\s"'<>\\]+/g;
  let match;
  while ((match = re.exec(html))) {
    paths.add(match[0].replace(/&amp;/g, "&"));
  }
  return [...paths];
}

function copyHeaders(source, extraDrop = []) {
  const drop = new Set([...DROP_WHEN_REWRITING, ...extraDrop.map((name) => name.toLowerCase())]);
  /** @type {http.OutgoingHttpHeaders} */
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || drop.has(key.toLowerCase())) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function pathnameOf(urlPath) {
  const queryIndex = urlPath.indexOf("?");
  return queryIndex === -1 ? urlPath : urlPath.slice(0, queryIndex);
}

function isJsPath(urlPath, contentType) {
  return pathnameOf(urlPath).endsWith(".js") || contentType.includes("javascript");
}

function isHtmlType(contentType) {
  return contentType.includes("text/html");
}

async function decodeBody(headers, body) {
  const encoding = String(headers["content-encoding"] || "")
    .toLowerCase()
    .trim();
  if (encoding === "gzip" || encoding === "x-gzip") {
    return gunzip(body);
  }
  if (encoding === "deflate") {
    return inflate(body);
  }
  if (encoding === "br") {
    return brotliDecompress(body);
  }
  return body;
}

function collectBody(stream) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function waitForPort(port, timeoutMs = 60_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port, host: HOST }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`next dest not ready on ${HOST}:${port}`));
          return;
        }
        setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

function portFree(port, host) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, host);
  });
}

/**
 * @param {string} path
 * @param {http.IncomingHttpHeaders} incomingHeaders
 */
function fetchInternal(path, incomingHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = { ...incomingHeaders };
    headers["accept-encoding"] = "identity";
    delete headers.connection;
    delete headers["proxy-connection"];
    delete headers["content-length"];
    delete headers["transfer-encoding"];

    const req = http.request(
      {
        hostname: HOST,
        port: INTERNAL_PORT,
        path,
        method: "GET",
        headers,
      },
      async (upRes) => {
        try {
          const raw = await collectBody(upRes);
          const body = await decodeBody(upRes.headers, raw);
          resolve({ status: upRes.statusCode ?? 502, headers: upRes.headers, body });
        } catch (error) {
          reject(error);
        }
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function cacheStatic(path, status, headers, body, extraDrop = []) {
  staticCache.set(path, {
    status,
    headers: copyHeaders(headers, extraDrop),
    body,
    expires: Date.now() + CACHE_TTL_MS,
  });
}

function serveCached(res, entry) {
  const headers = { ...entry.headers, "content-length": entry.body.length };
  res.writeHead(entry.status, headers);
  res.end(entry.body);
}

async function prepareJs(path, headers, body) {
  const { body: patchedBody, applied } = applyJsPatches(body);
  if (applied.length > 0) {
    log("applied", applied.join(", "), "patch to", path);
  }
  const extraDrop = applied.length > 0 ? ["etag", "last-modified"] : [];
  cacheStatic(path, 200, headers, patchedBody, extraDrop);
  return { body: patchedBody, extraDrop };
}

async function warmupStatic(paths, incomingHeaders) {
  await Promise.allSettled(
    paths.map(async (path) => {
      const cached = staticCache.get(path);
      if (cached && cached.expires > Date.now()) {
        return;
      }
      const upstream = await fetchInternal(path, incomingHeaders);
      if (isJsPath(path, String(upstream.headers["content-type"] || ""))) {
        await prepareJs(path, upstream.headers, upstream.body);
        return;
      }
      cacheStatic(path, upstream.status, upstream.headers, upstream.body);
    }),
  );
}

function handleHttp(req, res) {
  const path = req.url || "/";
  const cached = staticCache.get(path);
  if (path.startsWith("/_next/static/") && cached && cached.expires > Date.now()) {
    serveCached(res, cached);
    return;
  }

  const contentHint = String(req.headers.accept || "");
  const maybeDocument = req.method === "GET" && (contentHint.includes("text/html") || !path.startsWith("/_next/"));
  const maybeJs = path.endsWith(".js") || path.startsWith("/_next/static/");

  if (req.method !== "GET" && req.method !== "HEAD") {
    pipeProxy(req, res);
    return;
  }

  if (!maybeJs && !maybeDocument) {
    pipeProxy(req, res);
    return;
  }

  const headers = { ...req.headers };
  headers["accept-encoding"] = "identity";
  delete headers.connection;
  delete headers["proxy-connection"];

  const upstream = http.request(
    {
      hostname: HOST,
      port: INTERNAL_PORT,
      path,
      method: req.method,
      headers,
    },
    async (upRes) => {
      try {
        const contentType = String(upRes.headers["content-type"] || "");
        const html = isHtmlType(contentType);
        const js = isJsPath(path, contentType);
        const staticAsset = path.startsWith("/_next/static/");

        if (!html && !js && !staticAsset) {
          res.writeHead(upRes.statusCode ?? 502, copyHeaders(upRes.headers, []));
          upRes.pipe(res);
          return;
        }

        const raw = await collectBody(upRes);
        let body = await decodeBody(upRes.headers, raw);
        /** @type {string[]} */
        let extraDrop = [];

        if (html) {
          let htmlText = body.toString("utf-8");
          htmlText = stripChunkAsync(htmlText);
          await warmupStatic(extractStaticPaths(htmlText), req.headers);
          body = Buffer.from(htmlText);
          extraDrop = ["etag", "last-modified"];
        } else if (js) {
          const prepared = await prepareJs(path, upRes.headers, body);
          body = prepared.body;
          extraDrop = prepared.extraDrop;
        } else {
          cacheStatic(path, upRes.statusCode ?? 200, upRes.headers, body);
        }

        const outHeaders = copyHeaders(upRes.headers, extraDrop);
        outHeaders["content-length"] = body.length;
        res.writeHead(upRes.statusCode ?? 200, outHeaders);
        res.end(body);
      } catch (error) {
        log("rewrite failed", path, error);
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        }
        res.end("Bad gateway");
      }
    },
  );

  upstream.on("error", (error) => {
    log("upstream error", path, error.message);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("Bad gateway");
  });
  req.pipe(upstream);
}

function pipeProxy(req, res) {
  const headers = { ...req.headers };
  delete headers.connection;
  delete headers["proxy-connection"];

  const upstream = http.request(
    {
      hostname: HOST,
      port: INTERNAL_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (upRes) => {
      const outHeaders = {};
      for (const [key, value] of Object.entries(upRes.headers)) {
        if (value === undefined || HOP_BY_HOP.has(key.toLowerCase())) {
          continue;
        }
        outHeaders[key] = value;
      }
      res.writeHead(upRes.statusCode ?? 502, outHeaders);
      upRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    log("pipe error", req.url, error.message);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("Bad gateway");
  });
  req.pipe(upstream);
}

function handleUpgrade(req, clientSocket, head) {
  const upstream = net.connect(INTERNAL_PORT, HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          lines.push(`${key}: ${item}`);
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) {
      upstream.write(head);
    }
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  const fail = (error) => {
    log("ws bridge error", req.url, error?.message || error);
    clientSocket.destroy();
    upstream.destroy();
  };
  upstream.on("error", fail);
  clientSocket.on("error", fail);
}

async function main() {
  if (!Number.isInteger(PUBLIC_PORT) || PUBLIC_PORT <= 0) {
    throw new Error(`invalid DEPLOY_RUN_PORT: ${process.env.DEPLOY_RUN_PORT}`);
  }

  if (!(await portFree(PUBLIC_PORT, "0.0.0.0"))) {
    throw new Error(`public port ${PUBLIC_PORT} is already in use`);
  }
  if (!(await portFree(INTERNAL_PORT, HOST))) {
    throw new Error(`internal next port ${INTERNAL_PORT} is already in use`);
  }

  const child = spawn(process.execPath, [nextBin, "dev", "-H", HOST, "-p", String(INTERNAL_PORT)], {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });

  const shutdown = (signal) => {
    child.kill(signal);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  log(`waiting for next on ${HOST}:${INTERNAL_PORT}`);
  await waitForPort(INTERNAL_PORT);
  log(`public :${PUBLIC_PORT} → next :${INTERNAL_PORT}`);

  const server = http.createServer(handleHttp);
  server.on("upgrade", handleUpgrade);
  server.listen(PUBLIC_PORT, "0.0.0.0", () => {
    log(`listening on 0.0.0.0:${PUBLIC_PORT}`);
  });
}

main().catch((error) => {
  console.error("[dev-preview]", error);
  process.exit(1);
});
