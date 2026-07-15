import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURES_DIR = path.join(ROOT, "tests_e2e", "fixtures");
const DIST_SCRIPT = path.join(ROOT, "dist", "FISCAL 5.0.user.js");
const PORT = Number(process.env.E2E_PORT || 4173);

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    send(res, 404, "not found");
    return;
  }
  res.writeHead(200, { "content-type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/health") {
    return send(res, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
  }

  if (pathname === "/dist-script.js") {
    return sendFile(res, DIST_SCRIPT);
  }

  if (pathname.startsWith("/fixtures/")) {
    const rel = pathname.replace("/fixtures/", "");
    const f = path.join(FIXTURES_DIR, rel);
    if (!f.startsWith(FIXTURES_DIR)) return send(res, 403, "forbidden");
    return sendFile(res, f);
  }

  if (pathname.startsWith("/scenario/")) {
    const name = pathname.split("/").pop() || "happy";
    const f = path.join(FIXTURES_DIR, `${name}.html`);
    return sendFile(res, f);
  }


  if (pathname === "/") {
    return send(
      res,
      200,
      `<!doctype html><html><body>
      <h1>E2E Fixture Server</h1>
      <ul>
        <li><a href="/scenario/happy">happy</a></li>
        <li><a href="/scenario/em_atuacao">em_atuacao</a></li>
        <li><a href="/scenario/ncm_erro">ncm_erro</a></li>
        <li><a href="/scenario/confirmar_butSimContinuar">confirmar_butSimContinuar</a></li>
      </ul>
      </body></html>`,
      "text/html; charset=utf-8",
    );
  }

  return send(res, 404, "not found");
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[e2e-server] listening on http://127.0.0.1:${PORT}`);
});
