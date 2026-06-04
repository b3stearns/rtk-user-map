const crypto = require("crypto");

function generateGeodnetSignature(params, appKey) {
  const sortedKeys = Object.keys(params).filter(k => k !== "sign").sort();
  const concat = sortedKeys.map(k => String(params[k])).join("") + appKey;
  return crypto.createHash("md5").update(concat).digest("hex");
}

module.exports = async (req, res) => {
  try {
    const appId = "truenav";
    const appKey = "549a2429d314ff17";
    const now = Date.now();

    const params = {
      appId,
      lat: 44.0,
      lng: -97.0,
      radius: 450,
      amount: 400,     // increased
      time: now
    };

    const sign = generateGeodnetSignature(params, appKey);

    const r = await fetch("https://rtk.geodnet.com/api/v3/coverage/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sign })
    });

    const json = await r.json();

    const bases = (json.data || []).map(b => ({
      name: b.name,
      station: b.name,
      latitude: parseFloat(b.lat),
      longitude: parseFloat(b.lng)
    }));

    res.json({ data: bases });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
