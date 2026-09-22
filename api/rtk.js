const { requireSession, json } = require("./_lib/auth");

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  const raw = process.env.PI_RTK_URL || process.env.AIRSPACE_RTK_URL || "";
  if (!raw) {
    json(res, 200, { rovers: [], source: "unset" });
    return;
  }
  const base = raw.replace(/\/$/, "");
  const url = /\/api\/rtk(?:\?|$)/.test(base) ? base : base + "/api/rtk";
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    json(res, 200, { rovers: data.rovers || [], source: "proxy" });
  } catch (e) {
    json(res, 200, { rovers: [], error: e.message || "rtk proxy failed" });
  }
};
