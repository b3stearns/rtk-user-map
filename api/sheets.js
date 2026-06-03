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
    const hours = Math.min(parseInt(req.query.hours) || 24, 168);
    const startTime = now - (hours * 60 * 60 * 1000);

    let all = [], page = 1, pageSize = 100;
    while (page <= 10) {
      const params = { appId, page, pageSize, startTime, endTime: now, time: now };
      const sign = generateGeodnetSignature(params, appKey);
      const r = await fetch("https://rtk.geodnet.com/api/v3/user/rtklogs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, sign })
      });
      const json = await r.json();
      if ((json.code !== 1000 && json.code !== 0) || !json.data) break;
      const list = json.data.list || json.data || [];
      if (!list.length) break;
      all = all.concat(list);
      if (list.length < pageSize) break;
      page++;
    }

    const positions = all.map(log => ({
      username: log.username || "Unknown",
      miner_sn: log.miner_sn || "N/A",
      latitude: parseFloat(log.latitude),
      longitude: parseFloat(log.longitude),
      status: log.status || log.msg || "Online",
      loginTime: log.loginTime,
      ip: log.ip,
      GGA: log.GGA || log.gga || log.message || "",
      station: log.station || log.mountpoint || "N/A",
      partner: log.partner || "N/A",
      message: log.message || log.msg || "Success"
    })).filter(p => p.latitude && p.longitude);

    res.json({ data: positions, count: positions.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
