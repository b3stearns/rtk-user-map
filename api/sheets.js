const crypto = require("crypto");
const { requireSession, json } = require("./_lib/auth");
const { sanitizeLog } = require("./_lib/sanitize");
const { classifyAlerts } = require("./_lib/alerts");

function generateGeodnetSignature(params, appKey) {
  const sortedKeys = Object.keys(params).filter(k => k !== "sign").sort();
  const concat = sortedKeys.map(k => String(params[k])).join("") + appKey;
  return crypto.createHash("md5").update(concat).digest("hex");
}

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const appId = process.env.GEODNET_APP_ID || process.env.APP_ID;
    const appKey = process.env.GEODNET_APP_KEY || process.env.APP_KEY;
    if (!appId || !appKey) {
      json(res, 500, { error: "server configuration error" });
      return;
    }

    const now = Date.now();
    const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 24, 1), 4380);
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

    const sanitized = all.map(log => {
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

    const positions = sanitized.filter(p => p.latitude && p.longitude);
    const alerts = classifyAlerts(sanitized);

    json(res, 200, {
      data: positions,
      count: positions.length,
      alerts,
      alertCount: alerts.length
    });
  } catch (e) {
    json(res, 500, { error: e.message || "failed to load logs" });
  }
};
