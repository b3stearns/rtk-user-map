const { requireSession, json } = require("./_lib/auth");
const { classifyAlerts } = require("./_lib/alerts");
const { parseHours, fetchRtkLogs } = require("./_lib/geodnet");

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const hours = parseHours(req.query.hours);
    const sanitized = await fetchRtkLogs(hours);
    const positions = sanitized.filter(p => p.latitude && p.longitude);
    const alerts = classifyAlerts(sanitized);
    json(res, 200, {
      data: positions,
      count: positions.length,
      alerts,
      alertCount: alerts.length,
      hours
    });
  } catch (e) {
    json(res, e.statusCode || 500, { error: e.message || "failed to load logs" });
  }
};
