import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const client = process.env.OPENAI_API_KEY ? new OpenAI() : null;

async function readJson(rel) {
  return JSON.parse(await readFile(path.join(__dirname, rel), "utf8"));
}

async function loadCanonicalCatalog() {
  const index = await readJson("catalog/catalog.json");
  const products = [];
  for (const entry of index.products) {
    products.push(await readJson(entry.manifest));
  }
  return { index, products };
}

const canonicalCatalog = await loadCanonicalCatalog();

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function serveStatic(req, res) {
  const raw = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const safe = path.normalize(raw).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(publicDir, safe);
  if (!filePath.startsWith(publicDir)) return json(res, 403, { error: "forbidden" });

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not-file");
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    json(res, 404, { error: "not_found" });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      ok: true,
      operator_identity: canonicalCatalog.index.operator_identity,
      merchant_center_id: canonicalCatalog.index.merchant_center_id,
      openai_configured: Boolean(client),
      payment_mode: "NOT_LIVE",
      production_deployment: false,
      ratings_status: "NOT_VERIFIED_BY_RUNTIME"
    });
  }

  if (req.method === "GET" && req.url === "/api/catalog") {
    return json(res, 200, {
      operator_identity: canonicalCatalog.index.operator_identity,
      merchant_center_id: canonicalCatalog.index.merchant_center_id,
      products: canonicalCatalog.products,
      production: canonicalCatalog.index.production
    });
  }

  if (req.method === "POST" && req.url === "/api/advisor") {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 20_000) return json(res, 413, { error: "request_too_large" });
    }

    let body;
    try { body = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "invalid_json" }); }
    const question = String(body.question || "").trim().slice(0, 2000);
    if (!question) return json(res, 400, { error: "question_required" });
    if (!client) return json(res, 503, { error: "OPENAI_API_KEY_not_configured" });

    const response = await client.responses.create({
      model: "gpt-5.6",
      store: false,
      instructions: [
        "You are the JSONWisdom Store advisor.",
        "Use only the canonical product manifests supplied below.",
        "Never claim checkout, payment processing, delivery, reviews, ratings, authority, wallet control, ENS mutation, or deployment are live unless the supplied manifests explicitly establish them.",
        "Payment cannot buy truth or authority.",
        "Keep answers concise and receipt-first."
      ].join(" "),
      input: `OPERATOR\n${canonicalCatalog.index.operator_identity}\n\nCATALOG\n${JSON.stringify(canonicalCatalog.products, null, 2)}\n\nCUSTOMER QUESTION\n${question}`
    });

    return json(res, 200, {
      answer: response.output_text,
      operator_identity: canonicalCatalog.index.operator_identity,
      catalog_status: canonicalCatalog.products.map(({ product_id, name, commercial_state }) => ({ product_id, name, commercial_state }))
    });
  }

  if (req.method === "GET") return serveStatic(req, res);
  json(res, 405, { error: "method_not_allowed" });
});

server.listen(port, () => {
  console.log(`JSONWisdom Store v0.1 listening on http://localhost:${port}`);
});
