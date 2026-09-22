const fs = require("fs");
const path = require("path");
const { requireSession, json } = require("./_lib/auth");

const FALLBACK_URL = "https://raw.githubusercontent.com/b3stearns/rtk-user-map/90991b37f81e96400d7a3967c5efc721bd9147f7/api/_lib/stations.json";

// C05D898DDAE5 GEODNET console: N43°41'20.3" W98°0'1.7" — MTI campus north of East Spruce
const OVERRIDES = {
  DDAE5: { name: "Mitchell Tech", lat: 43.68897222, lng: -98.00047222 }
};

let cached = null;

function keyOf(b) {
  const mount = String((b && b.mount) || "").replace(/\*/g, "");
  const name = String((b && b.name) || "");
  return (mount.slice(-5) || name.slice(-5)).toUpperCase();
}

function applyOverrides(list) {
  return list.map(b => {
    const o = OVERRIDES[keyOf(b)] || OVERRIDES[String(b.name || "").toUpperCase()];
    if (!o) return b;
    return Object.assign({}, b, {
      name: o.name,
      station: o.name,
      latitude: o.lat,
      longitude: o.lng
    });
  });
}

function normalize(raw) {
  return applyOverrides((raw || []).map(b => ({
    id: b.id,
    name: b.name || b.mount || b.id,
    station: b.name || b.mount || b.id,
    mount: b.mount || "",
    latitude: parseFloat(b.lat != null ? b.lat : b.latitude),
    longitude: parseFloat(b.lng != null ? b.lng : b.longitude),
    status: b.status || "",
    state: b.state || "",
    registered: Boolean(b.registered)
  })).filter(b => Number.isFinite(b.latitude) && Number.isFinite(b.longitude)));
}

async function loadStations() {
  if (cached) return cached;
  const file = path.join(__dirname, "_lib", "stations.json");
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(raw) || raw.length < 10) raw = null;
  } catch (e) {
    raw = null;
  }
  if (!raw) {
    const r = await fetch(FALLBACK_URL);
    raw = await r.json();
  }
  cached = normalize(raw);
  return cached;
}

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const bases = await loadStations();
    json(res, 200, { data: bases, count: bases.length });
  } catch (e) {
    json(res, 500, { error: e.message || "failed to load bases" });
  }
};
