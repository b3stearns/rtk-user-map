const { clearSessionCookie, json } = require("./_lib/auth");

module.exports = async (req, res) => {
  clearSessionCookie(res);
  json(res, 200, { ok: true });
};
