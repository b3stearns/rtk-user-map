const fs = require("fs");
const path = require("path");
const { requireSession, json } = require("./_lib/auth");

let cached = null;

function loadStations() {
  if (cached) return cached;
  const file = path.join(__dirname, "_lib", "stations.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  cached = (raw || []).map(b => ({
    id: b.id,
    name: b.name || b.mount || b.id,
    station: b.name || b.mount || b.id,
    mount: b.mount || "",
    latitude: parseFloat(b.lat),
    longitude: parseFloat(b.lng),
    status: b.status || "",
    state: b.state || "",
    registered: Boolean(b.registered)
  })).filter(b => Number.isFinite(b.latitude) && Number.isFinite(b.longitude));
  return cached;
}

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const bases = loadStations();
    json(res, 200, { data: bases, count: bases.length });
  } catch (e) {
    json(res, 500, { error: e.message || "failed to load bases" });
  }
};
