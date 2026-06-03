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

    // Try user rtk logs endpoint
    const params = {
      appId,
      time: Date.now()
    };

    const sign = generateGeodnetSignature(params, appKey);

    const response = await fetch("https://rtk.geodnet.com/api/v3/user/rtkLogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sign })
    });

    const json = await response.json();

    if (json.code !== 0) {
      return res.status(500).json({ error: json.msg || "API Error" });
    }

    // Transform logs with GGA positions
    const positions = (json.data || []).map(log => {
      // Parse GGA if available
      let lat = null, lng = null;
      if (log.gga || log.NtripGGA) {
        const ggaStr = log.gga || log.NtripGGA;
        // Basic GGA parsing
        const parts = ggaStr.split(",");
        if (parts.length > 5) {
          lat = parseFloat(parts[2])/100;
          lng = parseFloat(parts[4])/100;
          // Convert DMS to decimal
          lat = Math.floor(lat) + (lat % 1)*100/60;
          lng = Math.floor(lng) + (lng % 1)*100/60;
          if (parts[3] === "S") lat = -lat;
          if (parts[5] === "W") lng = -lng;
        }
      }

      return {
        username: log.username,
        miner_sn: log.miner_sn,
        latitude: lat || parseFloat(log.lat),
        longitude: lng || parseFloat(log.lng),
        status: log.status,
        timestamp: log.timestamp,
        ...log
      };
    }).filter(p => p.latitude && p.longitude);

    res.json({ data: positions, count: positions.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
