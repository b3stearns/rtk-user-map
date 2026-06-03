const crypto = require("crypto");

function generateGeodnetSignature(params, appKey) {
  const sortedKeys = Object.keys(params)
    .filter(key => key !== "sign")
    .sort();

  const concatenated = sortedKeys.map(key => String(params[key])).join("");
  const payload = concatenated + appKey;
  return crypto.createHash("md5").update(payload).digest("hex");
}

module.exports = async (req, res) => {
  try {
    const appId = "truenav";
    const appKey = "549a2429d314ff17";

    const params = {
      appId,
      lat: 41.8781,
      lng: -87.6298,
      radius: 800,
      amount: 200,
      time: Date.now()
    };

    const sign = generateGeodnetSignature(params, appKey);

    const response = await fetch('https://rtk.geodnet.com/api/v3/coverage/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, sign })
    });

    const json = await response.json();

    if (json.code !== 0 || !json.data) {
      return res.status(500).json({ error: json.msg || 'API Error' });
    }

    const stations = json.data.map(s => ({
      username: s.name || s.miner_sn || 'Unknown',
      miner_sn: s.miner_sn,
      latitude: parseFloat(s.lat),
      longitude: parseFloat(s.lng),
      status: s.status || 'online',
      ...s
    })).filter(s => s.latitude && s.longitude);

    res.json({ data: stations, count: stations.length });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
