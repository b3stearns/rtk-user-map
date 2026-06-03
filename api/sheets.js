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

    const now = Date.now();

    const params = {
      appId,
      username: "",           // Leave empty for all users, or put specific username
      page: 1,
      pageSize: 100,
      time: now
    };

    const sign = generateGeodnetSignature(params, appKey);

    const response = await fetch("https://rtk.geodnet.com/api/v3/user/rtkLogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sign })
    });

    const json = await response.json();

    if (json.code !== 0) {
      console.error("API Error Response:", json);
      return res.status(500).json({ error: json.msg || "API Error", details: json });
    }

    const positions = (json.data?.list || json.data || []).map(log => {
      let lat = null, lng = null;
      const gga = log.gga || log.message || log.NtripGGA || "";

      if (gga && gga.includes("GGA")) {
        const parts = gga.split(",");
        if (parts.length > 5) {
          const latRaw = parseFloat(parts[2]);
          const lngRaw = parseFloat(parts[4]);
          if (!isNaN(latRaw) && !isNaN(lngRaw)) {
            lat = Math.floor(latRaw / 100) + (latRaw % 100) / 60;
            lng = Math.floor(lngRaw / 100) + (lngRaw % 100) / 60;
            if (parts[3] === "S") lat = -lat;
            if (parts[5] === "W") lng = -lng;
          }
        }
      }

      return {
        username: log.username || "Unknown",
        miner_sn: log.miner_sn,
        latitude: lat || parseFloat(log.lat || 0),
        longitude: lng || parseFloat(log.lng || 0),
        status: log.status,
        timestamp: log.signInTime || log.time
      };
    }).filter(p => p.latitude && !isNaN(p.latitude) && p.longitude && !isNaN(p.longitude));

    res.json({ data: positions, count: positions.length });

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: err.message });
  }
};
