const crypto = require("crypto");

function generateGeodnetSignature(params, appKey) {
  const sortedKeys = Object.keys(params)
    .filter(key => key !== "sign")
    .sort();
  const concat = sortedKeys.map(k => String(params[k])).join("") + appKey;
  return crypto.createHash("md5").update(concat).digest("hex");
}

module.exports = async (req, res) => {
  try {
    const appId = "truenav";
    const appKey = "549a2429d314ff17";

    const params = {
      appId,
      lat: 44.5,        // Centered on South Dakota
      lng: -96.8,       // Better for your region
      radius: 600,      // Larger coverage
      amount: 200,      // Max per call
      time: Date.now()
    };

    const sign = generateGeodnetSignature(params, appKey);

    const apiResponse = await fetch("https://rtk.geodnet.com/api/v3/coverage/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sign })
    });

    const json = await apiResponse.json();

    const stations = (json.data || []).map(s => ({
      username: s.name || s.miner_sn || 'Unknown',
      miner_sn: s.miner_sn,
      latitude: parseFloat(s.lat),
      longitude: parseFloat(s.lng),
      status: s.status || 'online',
      ...s
    })).filter(s => s.latitude && s.longitude);

    res.json({ data: stations, count: stations.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
