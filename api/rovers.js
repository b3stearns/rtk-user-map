const crypto = require("crypto");

function generateGeodnetSignature(params, appKey) {
  const sortedKeys = Object.keys(params)
    .filter(key => key !== "sign")
    .sort();
  const concatenated = sortedKeys.map(k => String(params[k])).join("") + appKey;
  return crypto.createHash("md5").update(concatenated).digest("hex");
}

module.exports = async (req, res) => {
  // Optional: Keep if you still use rover logs
  res.status(200).json({ message: "Rovers endpoint deprecated - using Coverage API in /api/sheets" });
};
