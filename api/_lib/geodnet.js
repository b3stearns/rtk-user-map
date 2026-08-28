const crypto = require("crypto");
const { sanitizeLog } = require("./sanitize");

function generateGeodnetSignature(params, appKey) {
  const sortedKeys = Object.keys(params).filter(k => k !== "sign").sort();
  const concat = sortedKeys.map(k => String(params[k])).join("") + appKey;
  return crypto.createHash("md5").update(concat).digest("hex");
}

function parseHours(queryHours) {
  return Math.min(Math.max(parseInt(queryHours, 10) || 12, 1), 4380);
}

async function fetchRtkLogs(hours) {
  const appId = process.env.GEODNET_APP_ID || process.env.APP_ID;
  const appKey = process.env.GEODNET_APP_KEY || process.env.APP_KEY;
  if (!appId || !appKey) {
    const err = new Error("server configuration error");
    err.statusCode = 500;
    throw err;
  }

  const now = Date.now();
  const startTime = now - (hours * 60 * 60 * 1000);
  let all = [];
  let page = 1;
  const pageSize = 200;
  const maxPages = hours > 720 ? 25 : hours > 168 ? 12 : 8;

  while (page <= maxPages) {
    const params = { appId, page, pageSize, startTime, endTime: now, time: now };
    const sign = generateGeodnetSignature(params, appKey);
    const r = await fetch("https://rtk.geodnet.com/api/v3/user/rtklogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sign })
    });
    const geodnet = await r.json();
    if ((geodnet.code !== 1000 && geodnet.code !== 0) || !geodnet.data) break;
    const list = geodnet.data.list || geodnet.data || [];
    if (!list.length) break;
    all = all.concat(list);
    if (list.length < pageSize) break;
    page++;
  }

  return all.map(log => {
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

module.exports = { parseHours, fetchRtkLogs, toTracks, ggaQuality };
