const crypto = require("crypto");
const { requireSession, json } = require("./_lib/auth");

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
    const params = { appId, lat: 44.0, lng: -97.0, radius: 650, amount: 400, time: now };
    const sign = generateGeodnetSignature(params, appKey);
    const r = await fetch("https://rtk.geodnet.com/api/v3/coverage/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sign })
    });
    const geodnet = await r.json();
    const bases = (geodnet.data || []).map(b => ({
      name: b.name,
      station: b.name,
      latitude: parseFloat(b.lat),
      longitude: parseFloat(b.lng)
    }));
    json(res, 200, { data: bases });
  } catch (e) {
    json(res, 500, { error: e.message || "failed to load bases" });
  }
};
