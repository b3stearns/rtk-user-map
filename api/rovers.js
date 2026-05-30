const crypto = require("crypto");

// GEODNET official signature generator function
function generateGeodnetSignature(params, appKey) {
  // 1. Filter out any existing 'sign' parameter and sort keys alphabetically
  const sortedKeys = Object.keys(params)
    .filter(key => key !== "sign")
    .sort();

  // 2. Concatenate the sorted parameter VALUES into a single string
  const concatenatedValues = sortedKeys.map(key => String(params[key])).join("");

  // 3. Append the appKey to the string and compute lowercase MD5 hash
  const payload = concatenatedValues + appKey;
  return crypto.createHash("md5").update(payload).digest("hex");
}

module.exports = async function (req, res) {
  try {
    const endMs = Date.now();
    const startMs = endMs - (365 * 24 * 60 * 60 * 1000); // 365 Days

    const formatDate = (ms) => new Date(ms).toISOString().replace('T', ' ').substring(0, 19);

    // 1. Put together your query parameters
    const baseParams = {
      appId: "deepsand", // Your official App ID
      current: 1,
      pageSize: 20000, 
      username: "",
      mountpoint: "",
      partner: "",
      start: startMs,
      end: endMs
    };

    // 2. Generate the official security token required by GEODNET
    const appKey = "cf52472779ebaae4"; // Your official App Key
    const sign = generateGeodnetSignature(baseParams, appKey);

    // 3. Build final payload (including the dates array 'times' and the 'sign')
    const finalPayload = {
      ...baseParams,
      times: [formatDate(startMs), formatDate(endMs)],
      userCaseSensitive: true,
      mountCaseSensitive: true,
      sign: sign
    };

    // 4. Send the officially signed request to GEODNET
    const response = await fetch('https://rtk.geodnet.com/api/v1/be/rtkLogs', {
      method: 'POST', 
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
        // Notice we no longer need the 'Authorization: Bearer' cookie headers!
      },
      body: JSON.stringify(finalPayload)
    });

    const json = await response.json();

    if (json.code !== 0 || !json.data || !json.data.list) {
      console.error("Official API Error:", json);
      return res.status(500).json({ error: 'GEODNET API rejected signature or parameters' });
    }

    // 5. Clean up data format for map ingestion
    const cleanMapData = json.data.list.map(log => ({
      id: log._id,
      username: log.username,
      station: log.station,
      lat: log.lat,
      lng: log.lng,
      status: log.status,
      loginTime: new Date(log.loginTime).toISOString(),
      distance: log.distance,
      request: log.request,       
      partner: log.partner,       
      ip: log.ip,                 
      duration: log.duration,     
      totalGGA: log.totalGGA,     
      msg: log.msg,
      avgAge: log.avgAge,
      maxAge: log.maxAge,
      ggaStats: log.ggaStats
    }));

    res.status(200).json(cleanMapData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
