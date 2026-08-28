const { getSession, json, unauthorized } = require("./_lib/auth");

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) {
    unauthorized(res);
    return;
  }
  json(res, 200, { user: session });
};
