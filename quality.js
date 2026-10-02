// NTRIP solution quality shared by the log API and the live map.
// Caster GGA quality (NMEA field 6): 4 RTK fixed, 5 RTK float.
// Anything else (GPS 1, DGPS 2, DR 6, invalid, unknown) is "other".
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TNQuality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function countOf(log, keys) {
    if (!log) return 0;
    for (let i = 0; i < keys.length; i++) {
      const v = log[keys[i]];
      if (v == null || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }

  // GEODNET rtklogs sends the latest GGA with spaces instead of commas:
  // "$GPGGA 224047.00 4430.8346 N 09844.7913 W 4 34 ..."
  // Field 6 is still the GPS quality indicator. Comma-separated sentences
  // keep empty fields, so those must be split on commas only.
  function ggaQuality(nmea) {
    if (nmea == null || nmea === "") return null;
    let s = String(nmea).trim();
    const pref = s.toLowerCase().indexOf("ntrip-gga:");
    if (pref >= 0) s = s.slice(pref + "ntrip-gga:".length).trim();
    const dollar = s.indexOf("$");
    if (dollar >= 0) s = s.slice(dollar);
    const lines = s.split(/\r?\n/);
    let line = "";
    for (let i = 0; i < lines.length; i++) {
      if (/GGA/i.test(lines[i])) { line = lines[i]; break; }
    }
    if (!line) line = s;
    const body = line.split("*")[0].trim();
    if (!/^\$[A-Z]{2}GGA/i.test(body)) return null;
    const parts = body.includes(",") ? body.split(",") : body.split(/\s+/);
    if (parts.length < 7) return null;
    const q = parseInt(parts[6], 10);
    return Number.isNaN(q) ? null : q;
  }

  function nmeaOf(log) {
    if (!log) return "";
    const candidates = [log.nmea, log.latestNmea, log.latest_nmea, log.GGA, log.gga];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (typeof c === "string" && c.indexOf("$") >= 0) return c;
    }
    return "";
  }

  function sessionQuality(log) {
    const fix = countOf(log, ["rtkFixed", "rtkfix", "no. of fix", "no_of_fix"]);
    const flt = countOf(log, ["rtkFloat", "no. of float", "no_of_float"]);
    const gga = countOf(log, ["totalGGA", "totalGga", "no. of gga", "no_of_gga"]);
    const spp = countOf(log, ["spp", "no. of sp", "no_of_sp"]);
    const dgps = countOf(log, ["dgps", "no. of dgps", "no_of_dgps"]);
    let q = ggaQuality(nmeaOf(log));
    // No parseable sentence: color from the caster's fix/float counts so a
    // session that is mostly RTK fixed is not drawn as unknown/red.
    if (q == null) {
      if (fix > 0 && fix >= flt && (gga === 0 || fix * 2 >= gga)) q = 4;
      else if (flt > 0 && flt > fix && (gga === 0 || flt * 2 >= gga)) q = 5;
    }
    return { q: q, gga: gga, fix: fix, float: flt, spp: spp, dgps: dgps };
  }

  function summarizeFixes(points) {
    let fix = 0, flt = 0, gga = 0, spp = 0, dgps = 0;
    const pts = points || [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i] || {};
      const samples = Number(p.gga);
      if (Number.isFinite(samples) && samples > 0) {
        fix += Number(p.fix) || 0;
        flt += Number(p.float) || 0;
        spp += Number(p.spp) || 0;
        dgps += Number(p.dgps) || 0;
        gga += samples;
      } else {
        gga += 1;
        if (p.q === 4) fix += 1;
        else if (p.q === 5) flt += 1;
        else if (p.q === 1) spp += 1;
        else if (p.q === 2) dgps += 1;
      }
    }
    const poor = Math.max(0, gga - fix - flt);
    const pct = c => gga ? Math.round((c / gga) * 1000) / 10 : 0;
    return {
      n: pts.length,
      fix: fix,
      float: flt,
      poor: poor,
      spp: spp,
      dgps: dgps,
      gga: gga,
      fixPct: pct(fix),
      floatPct: pct(flt),
      poorPct: pct(poor)
    };
  }

  // Green RTK fixed, yellow RTK float, red for GPS / DGPS / DR / other / unknown.
  function rtkColor(q) {
    return q === 4 ? "#22c55e" : q === 5 ? "#eab308" : "#ef4444";
  }

  return {
    ggaQuality: ggaQuality,
    sessionQuality: sessionQuality,
    summarizeFixes: summarizeFixes,
    rtkColor: rtkColor
  };
});
