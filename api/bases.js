const fs = require("fs");
const path = require("path");
const { requireSession, json } = require("./_lib/auth");

const FALLBACK_URL = "https://raw.githubusercontent.com/b3stearns/rtk-user-map/90991b37f81e96400d7a3967c5efc721bd9147f7/api/_lib/stations.json";
const OVERRIDES = {"14631":{"name":"Blaine","lat":43.614942,"lng":-96.943917},"2068D":{"name":"Stearns","lat":44.022505,"lng":-97.087042},"20BC9":{"name":"Rymerson","lat":44.580949,"lng":-96.688754},"29A91":{"name":"605 N","lat":43.608711,"lng":-96.719998},"29BDD":{"name":"Stearns","lat":44.318177,"lng":-98.219428},"29BFD":{"name":"Brown","lat":43.834571,"lng":-96.844792},"29C81":{"name":"Pam","lat":42.932756,"lng":-96.677742},"29DF1":{"name":"Daly","lat":44.078739,"lng":-99.454851},"2A729":{"name":"Plainview Colony","lat":45.582661,"lng":-99.009618},"2A7B1":{"name":"MKW","lat":43.582344,"lng":-96.594023},"2A8C1":{"name":"Lebahn","lat":43.826611,"lng":-96.72563},"2A8FD":{"name":"605 Dirt","lat":43.329748,"lng":-96.804023},"64DC5":{"name":"605 Real Estate","lat":43.499546,"lng":-96.768736},"652C1":{"name":"Eickelschulte","lat":43.695566,"lng":-96.745936},"65A9D":{"name":"Baumberger","lat":43.971786,"lng":-96.9917},"665C5":{"name":"Bohner","lat":43.440283,"lng":-96.844825},"97125":{"name":"Tuschen","lat":43.654434,"lng":-97.429256},"6FB65":{"name":"Haak","lat":43.857376,"lng":-96.578474},"74519":{"name":"Claussen","lat":44.065561,"lng":-97.6006},"D9AD5":{"name":"Lakner","lat":44.510189,"lng":-98.699386},"E3231":{"name":"Smit","lat":43.35944,"lng":-97.033168},"E44ED":{"name":"vzw","lat":44.236195,"lng":-96.587749},"E5569":{"name":"Wollmann","lat":44.016185,"lng":-97.109361},"EBF05":{"name":"Marquardt","lat":43.640893,"lng":-97.229591},"EFC6D":{"name":"abrahamson","lat":44.206926,"lng":-97.492925},"F0045":{"name":"Abrahamson","lat":43.776585,"lng":-97.89423},"F4AB1":{"name":"Diedrich","lat":44.216034,"lng":-96.624732},"FC8C1":{"name":"Hurley","lat":43.288162,"lng":-96.700797},"1C36D":{"name":"Stearns","lat":43.479829,"lng":-96.736969},"FD575":{"name":"Strom","lat":43.877161,"lng":-98.966006},"00CA5":{"name":"Hall","lat":44.51925,"lng":-99.200847},"D7039":{"name":"Knips","lat":44.386065,"lng":-103.658751},"DDAE5":{"name":"Mitchell Tech","lat":43.6908,"lng":-98.0039},"E4C99":{"name":"Dykstra","lat":43.445431,"lng":-96.969014},"1CBA5":{"name":"Worth","lat":45.05709,"lng":-100.13069},"1CE49":{"name":"Geigle","lat":44.411344,"lng":-100.26422}};

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
