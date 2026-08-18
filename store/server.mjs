import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const client = process.env.OPENAI_API_KEY ? new OpenAI() : null;

const catalog = [
  {
    name: "Flywheel of Wisdom",
    price: "$1 synthetic/manual test",
    status: "NOT_LIVE_CHECKOUT",
    description: "A receipt-first question/replay workflow. The current repository payment adapter is mock-only."
  },
  {
    name: "ReceiptOS Replay-Proof Report",
    price: "$300 manual service",
    status: "MANUAL_SERVICE_ONLY",
    description: "A separate manual service; this storefront does not create or imply an automated payment rail."
  }
];

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
      merchant_center_id: "5624520187",
      openai_configured: Boolean(client),
      payment_mode: "NOT_LIVE",
      ratings_status: "NOT_VERIFIED_BY_RUNTIME"
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
        "Only describe the catalog supplied below.",
        "Never claim checkout, payment processing, delivery, reviews, ratings, or deployment are live unless the catalog explicitly says so.",
        "Keep answers concise and receipt-first."
      ].join(" "),
      input: `CATALOG\n${JSON.stringify(catalog, null, 2)}\n\nCUSTOMER QUESTION\n${question}`
    });

    return json(res, 200, { answer: response.output_text, catalog_status: catalog.map(({ name, status }) => ({ name, status })) });
  }

  if (req.method === "GET") return serveStatic(req, res);
  json(res, 405, { error: "method_not_allowed" });
});

server.listen(port, () => {
  console.log(`JSONWisdom Store v0.1 listening on http://localhost:${port}`);
});
