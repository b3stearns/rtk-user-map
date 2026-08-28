const crypto = require("crypto");
const { sanitizeLog } = require("./sanitize");

const RTKLOGS_URL = "https://rtk.geodnet.com/api/v3/user/rtklogs";
// Geodnet silently clamps pageSize 200+ down to 20; 100 returns a full page.
const PAGE_SIZE = 100;
const MAX_SPAN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_PAGES_PER_SPAN = 50;
const FETCH_CONCURRENCY = 5;

function generateGeodnetSignature(params, appKey) {
  const sortedKeys = Object.keys(params).filter(k => k !== "sign").sort();
  const concat = sortedKeys.map(k => String(params[k])).join("") + appKey;
  return crypto.createHash("md5").update(concat).digest("hex");
}

function parseHours(queryHours) {
  return Math.min(Math.max(parseInt(queryHours, 10) || 12, 1), 4380);
}

function credentials() {
  const appId = process.env.GEODNET_APP_ID || process.env.APP_ID;
  const appKey = process.env.GEODNET_APP_KEY || process.env.APP_KEY;
  if (!appId || !appKey) {
    const err = new Error("server configuration error");
    err.statusCode = 500;
    throw err;
  }
  return { appId, appKey };
}

function fetchHours(hours) {
  const h = parseHours(hours);
  // loginTime is session start. A rover still online after 12h would miss a
  // strict 12h Geodnet window, so pull at least the last 24h then filter.
  if (h < 24) return 24;
  return h;
}

function windowSpans(endMs, hours) {
  const end = Number(endMs);
  const lookback = Math.min(fetchHours(hours) * 3600 * 1000, MAX_LOOKBACK_MS - 60 * 1000);
  const startMs = end - lookback;
  const spans = [];
  let windowEnd = end;
  while (windowEnd > startMs) {
    const windowStart = Math.max(startMs, windowEnd - MAX_SPAN_MS);
    spans.push({ startTime: windowStart, endTime: windowEnd });
    windowEnd = windowStart;
  }
  return spans;
}

function logOverlapsWindow(log, startTime, endTime) {
  const login = Number(log && log.loginTime) || 0;
  if (login > endTime) return false;
  const dur = parseFloat(log && log.duration);
  if (!isNaN(dur) && dur < 0) return true;
  if (login >= startTime) return true;
  if (!isNaN(dur) && dur > 0 && login + dur * 1000 >= startTime) return true;
  return false;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(Math.max(limit, 1), items.length || 1);
  await Promise.all(Array.from({ length: items.length ? n : 0 }, worker));
  return out;
}

async function postRtkLogs(appId, appKey, params) {
  const sign = generateGeodnetSignature(params, appKey);
  const r = await fetch(RTKLOGS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, sign })
  });
  return r.json();
}

async function fetchSpan(appId, appKey, startTime, endTime, now) {
  let all = [];
  let page = 1;
  let total = Infinity;
  while (page <= MAX_PAGES_PER_SPAN && all.length < total) {
    const params = {
      appId,
      page,
      pageSize: PAGE_SIZE,
      startTime,
      endTime,
      time: now
    };
    const geodnet = await postRtkLogs(appId, appKey, params);
    const code = geodnet && geodnet.code;
    if (code === 1010 && endTime - startTime > 60 * 60 * 1000) {
      const mid = startTime + Math.floor((endTime - startTime) / 2);
      const left = await fetchSpan(appId, appKey, startTime, mid, now);
      const right = await fetchSpan(appId, appKey, mid, endTime, now);
      return left.concat(right);
    }
    if (code === 1009) return all;
    if ((code !== 1000 && code !== 0) || !geodnet.data) {
      if (page === 1 && all.length === 0) {
        const err = new Error((geodnet && geodnet.msg) || "failed to load logs");
        err.statusCode = 502;
        err.geodnetCode = code;
        throw err;
      }
      break;
    }
    const data = geodnet.data;
    const list = data.list || (Array.isArray(data) ? data : []);
    if (typeof data.total === "number") total = data.total;
    const echoed = Number(data.pageSize) || PAGE_SIZE;
    if (!list.length) break;
    all = all.concat(list);
    if (list.length < echoed) break;
    if (all.length >= total) break;
    page++;
  }
  return all;
}

function dedupeLogs(logs) {
  const seen = new Set();
  const out = [];
  for (const log of logs || []) {
    const id = log && (log.id != null ? String(log.id) : "");
    const fallback = id || [
      log && log.username,
      log && log.loginTime,
      log && (log.mountpoint || log.station),
      log && log.ip
    ].join("|");
    if (seen.has(fallback)) continue;
    seen.add(fallback);
    out.push(log);
  }
  return out;
}

async function fetchRtkLogs(hours) {
  const { appId, appKey } = credentials();
  const requested = parseHours(hours);
  const now = Date.now();
  const filterStart = now - requested * 3600 * 1000;
  const spans = windowSpans(now, requested);
  const chunks = await mapPool(spans, FETCH_CONCURRENCY, async span => {
    try {
      return await fetchSpan(appId, appKey, span.startTime, span.endTime, now);
    } catch (err) {
      if (err && (err.geodnetCode === 1009 || err.geodnetCode === 1010)) return [];
      throw err;
    }
  });
  const raw = dedupeLogs(chunks.flat());
  const inWindow = raw.filter(log => logOverlapsWindow(log, filterStart, now));
  return inWindow.map(log => {
    const clean = sanitizeLog(log);
    return {
      ...clean,
      username: clean.username || "Unknown",
      latitude: parseFloat(clean.latitude),
      longitude: parseFloat(clean.longitude),
      GGA: clean.GGA || clean.gga || clean.message || "",
      station: clean.station || clean.mountpoint || ""
    };
  });
}

function ggaQuality(nmea) {
  if (!nmea) return null;
  const q = parseInt(String(nmea).split(",")[6], 10);
  return isNaN(q) ? null : q;
}

function toTracks(logs) {
  const grouped = new Map();
  (logs || []).forEach(log => {
    if (!log.latitude || !log.longitude) return;
    const mount = log.mountpoint || log.mount || log.station || "";
    const k = String(log.username || "Unknown") + "|" + mount;
    const arr = grouped.get(k) || [];
    arr.push(log);
    grouped.set(k, arr);
  });
  const now = Date.now();
  return [...grouped.values()].map(items => {
    items.sort((a, b) => Number(a.loginTime || 0) - Number(b.loginTime || 0));
    const last = items[items.length - 1];
    const dur = parseFloat(last.duration);
    const live = (!isNaN(dur) && dur < 0) || (last.loginTime && now - Number(last.loginTime) < 30 * 60 * 1000);
    return {
      username: last.username,
      mount: last.mountpoint || last.mount || last.station || "",
      live,
      duration: last.duration,
      last,
      points: items.map(p => ({
        lat: p.latitude,
        lng: p.longitude,
        t: Number(p.loginTime) || 0,
        q: ggaQuality(p.nmea || p.GGA)
      }))
    };
  }).sort((a, b) => Number(b.live) - Number(a.live) || (b.points[b.points.length - 1].t - a.points[a.points.length - 1].t));
}

module.exports = {
  parseHours,
  fetchHours,
  windowSpans,
  logOverlapsWindow,
  fetchRtkLogs,
  toTracks,
  ggaQuality,
  PAGE_SIZE,
  MAX_SPAN_MS,
  MAX_LOOKBACK_MS
};
