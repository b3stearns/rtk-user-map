const { requireSession, json } = require("./_lib/auth");

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  json(res, 200, { message: "Rovers endpoint deprecated - using Coverage API in /api/sheets" });
};
