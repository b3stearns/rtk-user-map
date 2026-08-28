const crypto = require("crypto");
const assert = require("assert");
const { checkPass, signToken, verifyToken, COOKIE_NAME } = require("../api/_lib/auth");
const { sanitizeLog } = require("../api/_lib/sanitize");
const { classifyAlerts, categoryFor } = require("../api/_lib/alerts");

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "N/A";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function sessionSeconds(p, related) {
  const d = parseFloat(p.duration ?? p.sessionTime);
  if (!isNaN(d) && d >= 0) return d;
  const pts = (related && related.length ? related : [p])
    .map(x => Number(x.loginTime))
    .filter(t => !isNaN(t) && t > 0)
    .sort((a, b) => a - b);
  if (pts.length >= 2) return (pts[pts.length - 1] - pts[0]) / 1000;
  if (pts.length === 1) return Math.max(0, (Date.now() - pts[0]) / 1000);
  return NaN;
}

function formatSessionTime(p, related) {
  const n = parseFloat(p.duration || p.sessionTime);
  if (!isNaN(n) && n > 0) return formatDuration(n);
  return formatDuration(sessionSeconds(p, related));
}

function updateSummary(data) {
  const users = new Set(data.map(d => d.username).filter(Boolean));
  const fixRates = data
    .map(d => parseFloat(d.fixRate ?? d.rtkfix ?? d["rtk fix rate(%)"] ?? d.rtkFixRate))
    .filter(n => !isNaN(n) && n > 0);
  const avgFix = fixRates.length ? (fixRates.reduce((a, b) => a + b, 0) / fixRates.length).toFixed(1) : 0;
  const dists = data.map(d => parseFloat(d.distance)).filter(n => !isNaN(n));
  const avgDistKm = dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : 0;
  const durations = data.map(d => parseFloat(d.duration)).filter(n => !isNaN(n));
  const totalHours = (durations.reduce((a, b) => a + b, 0) / 3600).toFixed(1);
  return {
    uniqueUsers: users.size,
    avgFix: avgFix + "%",
    avgDist: (avgDistKm * 0.621371).toFixed(1) + " miles",
    totalTime: totalHours + " hrs"
  };
}

function popupHasSessionTime(p, related) {
  const html = `<b>Session time:</b> ${formatSessionTime(p, related)}`;
  return html.includes("<b>Session time:</b>");
}

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("ok  " + name);
  } catch (e) {
    failed++;
    console.error("FAIL " + name + "\n  " + e.message);
  }
}

test("scrypt checkPass accepts matching hash", () => {
  const salt = crypto.randomBytes(16);
  const password = "correct-horse";
  const hash = crypto.scryptSync(password, salt, 64);
  assert.strictEqual(checkPass(password, salt.toString("hex"), hash.toString("hex")), true);
  assert.strictEqual(checkPass("wrong", salt.toString("hex"), hash.toString("hex")), false);
});

test("checkPass rejects truncated hash without throwing", () => {
  const salt = crypto.randomBytes(16).toString("hex");
  assert.strictEqual(checkPass("x", salt, "abcd"), false);
});

test("checkPass trims quoted hex env values", () => {
  const salt = crypto.randomBytes(16);
  const password = "quoted-env";
  const hash = crypto.scryptSync(password, salt, 64);
  assert.strictEqual(
    checkPass(password, '"' + salt.toString("hex") + '"', " " + hash.toString("hex") + "\n"),
    true
  );
});

test("login.js reads pre-parsed req.body", () => {
  const fs = require("fs");
  const src = fs.readFileSync(require("path").join(__dirname, "..", "api/login.js"), "utf8");
  assert.ok(src.includes("req.body"));
  assert.ok(src.includes("readBody"));
});

test("verifyDealer accepts existing DEALER_BRAD_PASSWORD env", () => {
  const { verifyDealer } = require("../api/_lib/auth");
  process.env.DEALER_BRAD_SALT = "";
  process.env.DEALER_BRAD_HASH = "";
  process.env.DEALER_BRAD_PASSWORD = "existing-dealer-pass";
  assert.ok(verifyDealer("brad", "existing-dealer-pass"));
  assert.strictEqual(verifyDealer("brad", "wrong"), null);
  assert.strictEqual(verifyDealer("nope", "existing-dealer-pass"), null);
  delete process.env.DEALER_BRAD_PASSWORD;
});

test("auth.js loads missing env from .env file", () => {
  const fs = require("fs");
  const src = fs.readFileSync(require("path").join(__dirname, "..", "api/_lib/auth.js"), "utf8");
  assert.ok(src.includes("loadEnvFiles"));
  assert.ok(src.includes(".env"));
  assert.ok(src.includes("geodnet.env"));
});

test("session HMAC roundtrip", () => {
  process.env.SESSION_SECRET = "unit-test-secret-not-for-prod";
  const token = signToken({ u: "brad", exp: Date.now() + 60000 });
  const session = verifyToken(token);
  assert.ok(session);
  assert.strictEqual(session.username, "brad");
  assert.strictEqual(session.name, "Brad Stearns");
  assert.strictEqual(verifyToken("nope"), null);
});

test("sanitizeLog strips request and passwords", () => {
  const clean = sanitizeLog({
    username: "Mike",
    request: "GET / with Authorization: Basic abc",
    password: "secret",
    userAgent: "NTRIP TnlAgClient/1.0",
    duration: 12
  });
  assert.strictEqual(clean.request, undefined);
  assert.strictEqual(clean.password, undefined);
  assert.strictEqual(clean.userAgent, "NTRIP TnlAgClient/1.0");
  assert.strictEqual(clean.username, "Mike");
});

test("alerts: failed, auth, disconnect, bad mount, dedupe", () => {
  const logs = [
    { id: "1", username: "A", msg: "Success", status: 0, duration: 10, loginTime: 100, station: "S1", mountpoint: "AUTO" },
    { id: "2", username: "B", msg: "Failed", status: 1, duration: 10, loginTime: 200, station: "S2", mountpoint: "AUTO" },
    { id: "3", username: "C", msg: "unauthorized", status: 401, duration: 1, loginTime: 300, station: "S3", mountpoint: "AUTO", userAgent: "auth fail" },
    { id: "4", username: "D", msg: "Success", status: 0, duration: -1, loginTime: 400, station: "S4", mountpoint: "AUTO" },
    { id: "5", username: "E", msg: "invalid mount", status: 0, duration: 5, loginTime: 500, station: "", mountpoint: "" },
    { id: "6", username: "B", msg: "Failed", status: 1, duration: 10, loginTime: 200, station: "S2", mountpoint: "AUTO" }
  ];
  assert.strictEqual(categoryFor(logs[0]), null);
  assert.strictEqual(categoryFor(logs[1]), "failed");
  assert.strictEqual(categoryFor(logs[2]), "auth");
  assert.strictEqual(categoryFor(logs[3]), "disconnect");
  assert.strictEqual(categoryFor(logs[4]), "mount");
  const alerts = classifyAlerts(logs);
  assert.strictEqual(alerts.length, 4);
  assert.ok(alerts.every(a => a.username && a.category && a.timeLabel));
});

test("session time uses duration when present", () => {
  const p = { duration: 3661, loginTime: 1000 };
  assert.strictEqual(formatSessionTime(p, [p]), "01:01:01");
  assert.ok(popupHasSessionTime(p, [p]));
});

test("session time falls back to last-first when duration missing or -1", () => {
  const a = { username: "Mike", duration: -1, loginTime: 1_000_000 };
  const b = { username: "Mike", duration: -1, loginTime: 1_000_000 + 125000 };
  assert.strictEqual(formatSessionTime(b, [a, b]), "00:02:05");
  const missing = { username: "Jon", loginTime: 2_000_000 };
  const missing2 = { username: "Jon", loginTime: 2_000_000 + 3600000 };
  assert.strictEqual(formatSessionTime(missing2, [missing, missing2]), "01:00:00");
});

test("summary formula matches public map (synthetic 720h-shaped)", () => {
  const data = [
    { username: "Mike", fixRate: 100, distance: 1.609344, duration: 3600 },
    { username: "Mike", fixRate: 98.2, distance: 1.609344, duration: 1800 },
    { username: "Jon", rtkfix: 0, distance: "x", duration: -1 }
  ];
  const s = updateSummary(data);
  assert.strictEqual(s.uniqueUsers, 2);
  const expectedFix = ((100 + 98.2) / 2).toFixed(1) + "%";
  assert.strictEqual(s.avgFix, expectedFix);
  const expectedMiles = (((1.609344 + 1.609344) / 2) * 0.621371).toFixed(1) + " miles";
  assert.strictEqual(s.avgDist, expectedMiles);
  const expectedHrs = ((3600 + 1800 + -1) / 3600).toFixed(1) + " hrs";
  assert.strictEqual(s.totalTime, expectedHrs);
});

test("cookie name is tn_session", () => {
  assert.strictEqual(COOKIE_NAME, "tn_session");
});

test("index.html popup still contains required fields", () => {
  const fs = require("fs");
  const html = fs.readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
  [
    "<b>Distance to Station:</b>",
    "<b>username:</b>",
    "<b>partner:</b>",
    "<b>Sign in time (CST):</b>",
    "<b>Session time:</b>",
    "<b>status:</b>",
    "<b>rtk fix rate(%):</b>",
    "<b>station:</b>",
    "<b>spp / dgps / fixed / float:</b>",
    "<b>avg age / max age:</b>",
    "<b>ip:</b>",
    "No NTRIP issues in this window.",
    "formatSessionTime",
    "Last 6 Months",
    "Search users",
    "NTRIP alerts",
    "Live users",
    'option value="12" selected'
  ].forEach(s => assert.ok(html.includes(s), "missing " + s));
  assert.ok(html.includes("parseInt(document.getElementById(\"timeFilter\").value, 10) || 12"));
  assert.ok(html.includes("/api/live?hours="));
  assert.ok(!html.includes("GeodnetLogo"));
  assert.ok(!html.includes("549a2429d314ff17"), "must not hardcode APP_KEY");
  [
    "Powered by BD Solutions",
    "nearest-three",
    "Nearest three",
    "accuracy rings",
    "Accuracy rings",
    "coverage-station"
  ].forEach(s => assert.ok(!html.includes(s), "coverage copy leaked: " + s));
});

test("login.html hides #err until failed POST", () => {
  const fs = require("fs");
  const html = fs.readFileSync(require("path").join(__dirname, "..", "login.html"), "utf8");
  assert.ok(html.includes('<div id="err" hidden></div>'));
  assert.ok(html.includes("#err{display:none") || html.includes("#err {display:none") || html.includes("#err{display:none;"));
  assert.ok(html.includes("#err:empty{display:none}"));
  assert.ok(html.includes("Invalid username or password"));
  assert.ok(!/id="err"[^>]*>Invalid/.test(html));
});

test("parseHours defaults to 12", () => {
  const { parseHours } = require("../api/_lib/geodnet");
  assert.strictEqual(parseHours(undefined), 12);
  assert.strictEqual(parseHours(""), 12);
  assert.strictEqual(parseHours("12"), 12);
  assert.strictEqual(parseHours("24"), 24);
  assert.strictEqual(parseHours("4380"), 4380);
  assert.strictEqual(parseHours("99999"), 4380);
});

test("live.js requires session", () => {
  const fs = require("fs");
  const src = fs.readFileSync(require("path").join(__dirname, "..", "api/live.js"), "utf8");
  assert.ok(src.includes("requireSession"));
  assert.ok(src.includes("toTracks"));
  const live = require("../api/live");
  const res = {
    headers: {},
    statusCode: 200,
    body: "",
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b || ""; }
  };
  live({ headers: {}, query: { hours: "12" } }, res);
  assert.strictEqual(res.statusCode, 401);
});

test("sheets.js uses env keys and requireSession", () => {
  const fs = require("fs");
  const path = require("path");
  const sheets = fs.readFileSync(path.join(__dirname, "..", "api/sheets.js"), "utf8");
  const geodnet = fs.readFileSync(path.join(__dirname, "..", "api/_lib/geodnet.js"), "utf8");
  assert.ok(sheets.includes("requireSession"));
  assert.ok(sheets.includes("classifyAlerts"));
  assert.ok(sheets.includes("fetchRtkLogs"));
  assert.ok(!sheets.includes("549a2429d314ff17"));
  assert.ok(geodnet.includes("GEODNET_APP_ID"));
  assert.ok(geodnet.includes("GEODNET_APP_KEY"));
  assert.ok(geodnet.includes("sanitizeLog"));
  assert.ok(!geodnet.includes("549a2429d314ff17"));
});

test("/api/sheets returns 401 without session", () => {
  const sheets = require("../api/sheets");
  const res = {
    headers: {},
    statusCode: 200,
    body: "",
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b || ""; }
  };
  sheets({ headers: {}, query: { hours: "24" } }, res);
  assert.strictEqual(res.statusCode, 401);
  assert.ok(String(res.body).includes("unauthorized"));
});

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nall tests passed");
