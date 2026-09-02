const BRAND_ICON_BASE = "/public/brands";

const OTHER = {
  id: "other",
  label: "Other",
  icon: BRAND_ICON_BASE + "/other.png"
};

// Order matters: more specific User-Agents first. Unknown → Other (never a generic brown dot).
const BRANDS = [
  {
    id: "john-deere",
    label: "John Deere",
    icon: BRAND_ICON_BASE + "/john-deere.png",
    test: s => /cloudbase|john\s*deere|\bdeere\b|starfire|_jd\b/i.test(s)
  },
  {
    id: "fjd",
    label: "FJD / FJDynamics",
    icon: BRAND_ICON_BASE + "/fjd.png",
    test: s => /fjdynamics|\bfjd\b|gnssinternetradio/i.test(s)
  },
  {
    id: "dji",
    label: "DJI",
    icon: BRAND_ICON_BASE + "/dji.png",
    test: s => /\bdji\b/i.test(s)
  },
  {
    id: "cnh",
    label: "CNH",
    icon: BRAND_ICON_BASE + "/cnh.png",
    test: s => /cnhintrip|\bcnh\b|caseih|case\s*ih/i.test(s)
  },
  {
    id: "topcon",
    label: "Topcon",
    icon: BRAND_ICON_BASE + "/topcon.png",
    test: s => /topcon|tpa\s*client|ntrip\s+tpa\b/i.test(s)
  },
  {
    id: "outback",
    label: "Outback",
    icon: BRAND_ICON_BASE + "/outback.png",
    test: s => /outback|\bhgps\b/i.test(s)
  },
  {
    id: "raven",
    label: "Raven",
    icon: BRAND_ICON_BASE + "/raven.png",
    test: s => /\braven\b/i.test(s)
  },
  {
    id: "ag-leader",
    label: "AgLeader",
    icon: BRAND_ICON_BASE + "/ag-leader.svg",
    test: s => /ag[\s-]?leader|agleader/i.test(s)
  },
  {
    id: "emlid",
    label: "Emlid",
    icon: BRAND_ICON_BASE + "/emlid.svg",
    test: s => /\bemlid\b/i.test(s)
  },
  {
    id: "agco",
    label: "AGCO",
    icon: BRAND_ICON_BASE + "/agco.svg",
    test: s => /\bagco\b/i.test(s) && !/lefebure|tnlag/i.test(s)
  },
  {
    id: "trimble",
    label: "Trimble",
    icon: BRAND_ICON_BASE + "/trimble.png",
    test: s => /trimble|tnlagclient|\btnlag\b|lefebure/i.test(s)
  }
];

const IGNORE_MOUNT = /^(AUTO|NONE|N\/A)$/i;

function extractUserAgent(log) {
  if (!log || typeof log !== "object") return "";
  const direct = log.userAgent || log.user_agent || log.ua;
  if (typeof direct === "string" && direct.trim() && !/authorization\s*:/i.test(direct)) {
    return direct.trim().slice(0, 400);
  }
  const req = String(log.request || "");
  if (!req) return "";
  const cleaned = req.replace(/Authorization:\s*\S+/gi, "");
  const m = cleaned.match(/user-agent:\s*([^\r\n]+)/i);
  if (m) return m[1].trim().slice(0, 400);
  if (!/GET |POST |Host:/i.test(cleaned)) return cleaned.trim().slice(0, 400);
  return "";
}

function inferBrand(log) {
  const s = extractUserAgent(log);
  for (const b of BRANDS) {
    if (b.test(s)) return { id: b.id, label: b.label, icon: b.icon };
  }
  return { id: OTHER.id, label: OTHER.label, icon: OTHER.icon };
}

function stationKeys(raw) {
  if (!raw || typeof raw !== "object") return [];
  const last = raw.last && typeof raw.last === "object" ? raw.last : {};
  const vals = [
    raw.station,
    last.station,
    raw.mount,
    raw.mountpoint,
    last.mountpoint,
    last.mount
  ];
  const keys = [];
  for (const v of vals) {
    const s = String(v || "").replace(/^\*+/, "").trim().toUpperCase();
    if (!s || IGNORE_MOUNT.test(s)) continue;
    if (!keys.includes(s)) keys.push(s);
  }
  return keys;
}

function matchStation(raw, bases) {
  const keys = stationKeys(raw);
  if (!keys.length || !Array.isArray(bases) || !bases.length) return null;
  let best = null;
  let bestScore = 0;
  for (const b of bases) {
    const tokens = [b.name, b.station, b.mount, b.id]
      .map(v => String(v || "").replace(/^\*+/, "").trim().toUpperCase())
      .filter(t => t && t.length >= 3 && !IGNORE_MOUNT.test(t));
    for (const token of tokens) {
      for (const k of keys) {
        let score = 0;
        if (token === k) score = 10000 + token.length;
        else if (k.endsWith(token) && token.length >= 4) score = 5000 + token.length;
        else if (token.endsWith(k) && k.length >= 4) score = 4000 + k.length;
        if (score > bestScore) {
          bestScore = score;
          best = b;
        }
      }
    }
  }
  return bestScore >= 4000 ? best : null;
}

module.exports = {
  BRANDS,
  OTHER,
  extractUserAgent,
  inferBrand,
  stationKeys,
  matchStation
};
