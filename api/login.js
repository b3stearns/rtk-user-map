const { verifyDealer, setSessionCookie, json } = require("./_lib/auth");

function parseForm(raw) {
  const out = {};
  String(raw || "").split("&").forEach(part => {
    if (!part) return;
    const i = part.indexOf("=");
    const k = i === -1 ? part : part.slice(0, i);
    const v = i === -1 ? "" : part.slice(i + 1);
    try {
      out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.replace(/\+/g, " "));
    } catch {
      out[k] = v;
    }
  });
  return out;
}

function parseRaw(raw, req) {
  const trimmed = String(raw || "").trim();
  const ctype = String((req.headers && (req.headers["content-type"] || req.headers["Content-Type"])) || "");
  if (!trimmed) return {};
  if (ctype.includes("application/x-www-form-urlencoded")) return parseForm(trimmed);
  try {
    return JSON.parse(trimmed);
  } catch {
    const err = new Error("invalid json");
    err.code = "INVALID_JSON";
    throw err;
  }
}

async function readBody(req) {
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) return parseRaw(req.body.toString("utf8"), req);
    if (typeof req.body === "string") return parseRaw(req.body, req);
    if (typeof req.body === "object") return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return parseRaw(Buffer.concat(chunks).toString("utf8") || "", req);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return;
  }
  try {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      if (e && e.code === "INVALID_JSON") {
        json(res, 400, { error: "invalid json" });
        return;
      }
      throw e;
    }
    const username = body.username || body.user || body.email;
    const password = body.password || body.pass;
    try {
      const { envFlags } = require("./_lib/auth");
      console.log("tn-login", JSON.stringify({
        ...envFlags(),
        hasUser: Boolean(username && String(username).trim()),
        hasPass: Boolean(password),
        parsedKeys: body && typeof body === "object" ? Object.keys(body).length : 0
      }));
    } catch (_) {}
    const user = verifyDealer(username, password);
    if (!user) {
      json(res, 401, { error: "invalid username or password" });
      return;
    }
    setSessionCookie(res, user);
    json(res, 200, { ok: true, user });
  } catch (e) {
    json(res, 500, { error: "login failed" });
  }
};
