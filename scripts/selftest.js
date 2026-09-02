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

test("Geodnet windows paginate and chunk past 7 days", () => {
  const {
    windowSpans,
    fetchHours,
    logOverlapsWindow,
    PAGE_SIZE,
    MAX_SPAN_MS,
    MAX_LOOKBACK_MS
  } = require("../api/_lib/geodnet");
  const fs = require("fs");
  const src = fs.readFileSync(require("path").join(__dirname, "..", "api/_lib/geodnet.js"), "utf8");
  assert.ok(PAGE_SIZE <= 100);
  assert.ok(src.includes("data.list") || src.includes("data.pageSize"));
  assert.ok(src.includes("MAX_PAGES_PER_SPAN"));
  assert.strictEqual(fetchHours(12), 24);
  assert.strictEqual(fetchHours(24), 24);
  assert.strictEqual(fetchHours(720), 720);
  const now = Date.UTC(2026, 7, 28, 14, 0, 0);
  const spans12 = windowSpans(now, 12);
  assert.strictEqual(spans12.length, 1);
  assert.ok(spans12[0].endTime - spans12[0].startTime <= MAX_SPAN_MS);
  const spans30 = windowSpans(now, 720);
  assert.ok(spans30.length >= 5, "30d should be multiple 7-day spans");
  assert.ok(spans30.every(s => s.endTime - s.startTime <= MAX_SPAN_MS));
  const spans6mo = windowSpans(now, 4380);
  assert.ok(spans6mo.length >= 20);
  assert.ok(spans6mo.every(s => s.endTime - s.startTime <= MAX_SPAN_MS));
  const oldest = Math.min(...spans6mo.map(s => s.startTime));
  assert.ok(now - oldest <= MAX_LOOKBACK_MS);
  const live = { loginTime: now - 16 * 3600 * 1000, duration: -1 };
  assert.ok(logOverlapsWindow(live, now - 12 * 3600 * 1000, now));
  const oldDone = { loginTime: now - 20 * 3600 * 1000, duration: 600 };
  assert.ok(!logOverlapsWindow(oldDone, now - 12 * 3600 * 1000, now));
  const recent = { loginTime: now - 2 * 3600 * 1000, duration: 120 };
  assert.ok(logOverlapsWindow(recent, now - 12 * 3600 * 1000, now));
});

test("station dataset matches coverage ND+SD map", () => {
  const fs = require("fs");
  const path = require("path");
  const stations = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "api/_lib/stations.json"), "utf8"));
  assert.ok(stations.length >= 140, "expected ~144 coverage stations, got " + stations.length);
  assert.ok(stations.some(s => s.state === "North Dakota"));
  assert.ok(stations.some(s => s.state === "South Dakota"));
  const lats = stations.map(s => s.lat);
  assert.ok(Math.max(...lats) > 47, "North Dakota lats missing");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes("/api/bases"));
  assert.ok(html.includes("Stations"));
  assert.ok(html.includes("< 1 cm"));
  assert.ok(!html.includes("const myStations"));
  assert.ok(!html.includes("grok.me"));
  assert.ok(!html.includes("iframe"));
  const bases = fs.readFileSync(path.join(__dirname, "..", "api/bases.js"), "utf8");
  assert.ok(bases.includes("stations.json"));
  assert.ok(!bases.includes("radius: 650"));
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

test("inferBrand maps known NTRIP user-agents and never leaks Authorization", () => {
  const { inferBrand, extractUserAgent, matchStation } = require("../api/_lib/hardware");
  const cases = [
    ["GET /AUTO HTTP/1.1 Host:rtk.geodnet.com User-Agent: NTRIP Cloudbase/4.1.4_JD Accept:*/* Authorization: Basic abc== Connection:close", "john-deere", "John Deere"],
    ["User-Agent: NTRIP TPA Client/0.0.0", "topcon", "Topcon"],
    ["User-Agent: NTRIP LefebureAndroidIntNTRIPClient/20211203 Authorization: Basic xyz", "trimble", "Trimble"],
    ["User-Agent: NTRIP GNSSInternetRadio/1.0", "fjd", "FJD / FJDynamics"],
    ["User-Agent: NTRIP NtripClientiOS/3.0", "other", "Other"],
    ["User-Agent: NTRIP TnlAgClient/1.0", "trimble", "Trimble"],
    ["User-Agent: NTRIP CNHiNTRIP/1.0", "cnh", "CNH"],
    ["User-Agent: HGPS/2.0", "outback", "Outback"],
    ["User-Agent: DJI GS RTK", "dji", "DJI"],
    ["User-Agent: Raven Slingshot", "raven", "Raven"],
    ["User-Agent: AgLeader InCommand", "ag-leader", "AgLeader"],
    ["User-Agent: Emlid Reach", "emlid", "Emlid"],
    ["User-Agent: AGCO AccuTerminal", "agco", "AGCO"],
    ["", "other", "Other"]
  ];
  for (const [request, id, label] of cases) {
    const brand = inferBrand({ request });
    assert.strictEqual(brand.id, id, request + " → " + brand.id);
    assert.strictEqual(brand.label, label);
    assert.ok(!/authorization/i.test(JSON.stringify(brand)));
    assert.ok(!extractUserAgent({ request }).includes("Basic"));
  }
  const fromUa = inferBrand({ userAgent: "NTRIP Cloudbase/4.1.4_JD" });
  assert.strictEqual(fromUa.id, "john-deere");
  const clean = sanitizeLog({
    username: "MTIrtk",
    request: "GET / Authorization: Basic secret User-Agent: NTRIP Cloudbase/4.1.4_JD",
    password: "x"
  });
  assert.strictEqual(clean.request, undefined);
  assert.strictEqual(clean.hardware, undefined);
  const tagged = { ...clean, ...inferBrand({ request: "User-Agent: NTRIP Cloudbase/4.1.4_JD Authorization: Basic secret" }) };
  assert.strictEqual(tagged.hardware || tagged.id, "john-deere");
  assert.strictEqual(tagged.request, undefined);

  const bases = [
    { name: "DDAE5", mount: "****DDAE5", lat: 43.68, lng: -98.01 },
    { name: "DA941", mount: "****DA941", lat: 44.81, lng: -96.75 }
  ];
  const hit = matchStation({ station: "C05D898DDAE5", mount: "AUTO" }, bases);
  assert.ok(hit);
  assert.strictEqual(hit.name, "DDAE5");
  const short = matchStation({ last: { station: "C05D898DDAE5" }, mount: "AUTO" }, bases);
  assert.strictEqual(short.name, "DDAE5");
  const byTail = matchStation({ station: "DAE5" }, bases);
  assert.strictEqual(byTail.name, "DDAE5");
  assert.strictEqual(matchStation({ mount: "AUTO" }, bases), null);
});

test("toTracks copies hardware onto each session", () => {
  const { toTracks } = require("../api/_lib/geodnet");
  const tracks = toTracks([
    { username: "MTIrtk", latitude: 43.68, longitude: -98.01, mountpoint: "AUTO", station: "C05D898DDAE5", loginTime: 1, hardware: "john-deere", hardwareLabel: "John Deere", nmea: "$GPGGA,,,,,,4,,,,," },
    { username: "MTIrtk", latitude: 43.681, longitude: -98.012, mountpoint: "AUTO", station: "C05D898DDAE5", loginTime: 2, hardware: "john-deere", hardwareLabel: "John Deere", nmea: "$GPGGA,,,,,,4,,,,," }
  ]);
  assert.strictEqual(tracks.length, 1);
  assert.strictEqual(tracks[0].hardware, "john-deere");
  assert.strictEqual(tracks[0].hardwareLabel, "John Deere");
  assert.strictEqual(tracks[0].points.length, 2);
});

test("brand logo files exist and dealer map uses selected-session station line", () => {
  const fs = require("fs");
  const path = require("path");
  const brands = path.join(__dirname, "..", "public/brands");
  [
    "john-deere.png", "trimble.png", "fjd.png", "dji.png", "cnh.png",
    "topcon.png", "outback.png", "raven.png", "other.png",
    "ag-leader.svg", "emlid.svg", "agco.svg"
  ].forEach(f => assert.ok(fs.existsSync(path.join(brands, f)), "missing logo " + f));
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes("drawStationLine"));
  assert.ok(html.includes("function deselect"));
  assert.ok(html.includes("hw-mk"));
  assert.ok(html.includes("/public/brands/john-deere.png"));
  assert.ok(html.includes("L.divIcon"));
  assert.ok(!html.includes("function drawLine"));
  assert.ok(!html.includes("fill = t.live ? \"#c5a46e\""));
  assert.ok(html.includes("[[p.lat, p.lng], [slat, slng]]"));
  const geodnet = fs.readFileSync(path.join(__dirname, "..", "api/_lib/geodnet.js"), "utf8");
  assert.ok(geodnet.includes("inferBrand"));
  assert.ok(geodnet.includes("hardware: brand.id"));
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
