const { verifyDealer, setSessionCookie, json } = require("./_lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return;
  }
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8") || "{}";
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      json(res, 400, { error: "invalid json" });
      return;
    }
    const user = verifyDealer(body.username, body.password);
    if (!user) {
      json(res, 401, { error: "invalid username or password" });
      return;
    }
    setSessionCookie(res, user);
    json(res, 200, { ok: true, user });
  } catch (e) {
    json(res, 500, { error: "login failed" });
  }
};
