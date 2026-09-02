const { requireSession, json } = require("./_lib/auth");
const { parseHours, fetchRtkLogs, toTracks } = require("./_lib/geodnet");

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const hours = parseHours(req.query.hours);
    const logs = await fetchRtkLogs(hours);
    const tracks = toTracks(logs);
    json(res, 200, {
      tracks,
      count: tracks.length,
      live: tracks.filter(t => t.live).length,
      hours
    });
  } catch (e) {
    json(res, e.statusCode || 500, { error: e.message || "failed to load live users" });
  }
};
