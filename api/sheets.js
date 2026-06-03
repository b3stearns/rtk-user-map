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
    const hours = parseInt(req.query.hours) || 24;
    const startTime = now - (hours * 60 * 60 * 1000);

    const params = { appId, page: 1, pageSize: 200, startTime, endTime: now, time: now };
    const sign = generateGeodnetSignature(params, appKey);

    const r = await fetch("https://rtk.geodnet.com/api/v3/user/rtklogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sign })
    });
    const json = await r.json();

    const list = json.data?.list || json.data || [];
    const positions = list.map(log => {
      let lat = null, lng = null;
      const gga = log.GGA || log.gga || "";
      if (gga.includes("GGA")) {
        const p = gga.split(",");
        if (p.length > 5) {
          lat = Math.floor(parseFloat(p[2])/100) + (parseFloat(p[2])%100)/60;
          lng = Math.floor(parseFloat(p[4])/100) + (parseFloat(p[4])%100)/60;
          if (p[3]==="S") lat=-lat; if (p[5]==="W") lng=-lng;
        }
      }
      return {
        username: log.username || "Unknown",
        miner_sn: log.miner_sn || "N/A",
        latitude: lat || parseFloat(log.latitude),
        longitude: lng || parseFloat(log.longitude),
        status: log.status || "Online",
        loginTime: log.loginTime,
        ip: log.ip,
        GGA: gga
      };
    }).filter(p => p.latitude && p.longitude);

    res.json({ data: positions, count: positions.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
