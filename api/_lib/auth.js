const crypto = require("crypto");

const COOKIE_NAME = "tn_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

const DEALERS = {
  brad: {
    name: "Brad Stearns",
    saltEnv: "DEALER_BRAD_SALT",
    hashEnv: "DEALER_BRAD_HASH"
  },
  jon: {
    name: "Jon",
    saltEnv: "DEALER_JON_SALT",
    hashEnv: "DEALER_JON_HASH"
  }
};

function sessionSecret() {
  return process.env.SESSION_SECRET || "";
}

function parseCookies(req) {
  const header = req.headers.cookie || req.headers.Cookie || "";
  const out = {};
  String(header).split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) return;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function signToken(payload) {
  const secret = sessionSecret();
  if (!secret) throw new Error("missing SESSION_SECRET");
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

function verifyToken(token) {
  const secret = sessionSecret();
  if (!secret || !token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || payload.exp < Date.now()) return null;
    if (!DEALERS[payload.u]) return null;
    return { username: payload.u, name: DEALERS[payload.u].name };
  } catch {
    return null;
  }
}

function checkPass(password, saltHex, hashHex) {
  try {
    if (!password || !saltHex || !hashHex) return false;
    const salt = Buffer.from(String(saltHex), "hex");
    const expected = Buffer.from(String(hashHex), "hex");
    if (!salt.length || expected.length !== 64) return false;
    const derived = crypto.scryptSync(String(password), salt, 64);
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function verifyDealer(username, password) {
  const key = String(username || "").trim().toLowerCase();
  const dummySalt = "00".repeat(16);
  const dummyHash = "00".repeat(64);
  const dealer = DEALERS[key];
  const salt = (dealer && process.env[dealer.saltEnv]) || dummySalt;
  const hash = (dealer && process.env[dealer.hashEnv]) || dummyHash;
  const ok = checkPass(password, salt, hash);
  if (!dealer || !ok) return null;
  return { username: key, name: dealer.name };
}

function cookieHeader(token, extra = "") {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    extra
  ].filter(Boolean);
  return parts.join("; ");
}

function setSessionCookie(res, user) {
  const token = signToken({ u: user.username, exp: Date.now() + MAX_AGE_SEC * 1000 });
  res.setHeader("Set-Cookie", cookieHeader(token, `Max-Age=${MAX_AGE_SEC}`));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", cookieHeader("", "Max-Age=0"));
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[COOKIE_NAME] || "");
}

function unauthorized(res) {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error: "unauthorized" }));
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    unauthorized(res);
    return null;
  }
  return session;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = {
  COOKIE_NAME,
  DEALERS,
  checkPass,
  verifyDealer,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  requireSession,
  unauthorized,
  json,
  signToken,
  verifyToken
};
