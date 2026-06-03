const crypto = require("crypto");

function generateGeodnetSignature(params, appKey) {
  const sortedKeys = Object.keys(params)
    .filter(key => key !== "sign")
    .sort();

  const concatenatedValues = sortedKeys.map(key => String(params[key])).join("");
  const payload = concatenatedValues + appKey;
  return crypto.createHash("md5").update(payload).digest("hex");
}

module.exports = async (req, res) => {
  console.log('Received request to /api/sheets (now using Coverage API)');

  try {
    const appId = "truenav";
    const appKey = "549a2429d314ff17";

    // Default to broad US coverage centered on Chicago
    const params = {
      appId: appId,
      lat: 41.8781,
      lng: -87.6298,
      radius: 800,      // Large radius for good coverage
      amount: 200,      // Max stations per call
      time: Date.now()
    };

    const sign = generateGeodnetSignature(params, appKey);

    const finalPayload = {
      ...params,
      sign: sign
    };

    const response = await fetch('https://rtk
