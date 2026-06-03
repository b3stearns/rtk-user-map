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
      lat: 41.8781,
      lng: -87.6298,
      radius: 500,
      amount: 50,
      time: Date.now()
    };

    const sign = generateGeodnetSignature(params, appKey);

    const apiResponse = await fetch("https://rtk.geodnet.com/api/v3/coverage/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sign })
    });

    const json = await apiResponse.json();

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      success: true,
      count: json.data ? json.data.length : 0,
      data: json.data || []
    });

  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ error: err.message });
  }
};
