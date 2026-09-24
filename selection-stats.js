(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TNStats = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
  }

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return "N/A";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function formatCst(ms) {
    const n = Number(ms);
    if (!n || isNaN(n)) return "N/A";
    try {
      return new Date(n).toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CST";
    } catch (e) {
      return "N/A";
    }
  }

  function qualityShare(points) {
    const pts = points || [];
    let fix = 0, flt = 0, less = 0;
    pts.forEach(p => {
      const q = p && p.q;
      if (q === 4) fix++;
      else if (q === 5) flt++;
      else less++;
    });
    const n = pts.length;
    const pct = c => (n ? (100 * c / n).toFixed(1) + "%" : "N/A");
    const times = pts.map(p => Number(p && p.t)).filter(t => t > 0).sort((a, b) => a - b);
    return {
      n,
      fix,
      float: flt,
      less,
      fixPct: pct(fix),
      floatPct: pct(flt),
      lessPct: pct(less),
      start: times.length ? times[0] : null,
      end: times.length ? times[times.length - 1] : null
    };
  }

  // Prefer a positive caster duration, then the longest related log, then first-to-last point span.
  function sessionSeconds(opts) {
    opts = opts || {};
    const d = parseFloat(opts.duration);
    if (!isNaN(d) && d > 0) return d;
    let best = 0;
    (opts.logs || []).forEach(x => {
      const n = parseFloat(x && x.duration);
      if (!isNaN(n) && n > best) best = n;
    });
    if (best > 0) return best;
    const times = (opts.points || []).map(p => Number(p && p.t)).filter(t => t > 0).sort((a, b) => a - b);
    if (times.length >= 2) return Math.max(0, (times[times.length - 1] - times[0]) / 1000);
    if (times.length === 1) return Math.max(0, ((opts.now || Date.now()) - times[0]) / 1000);
    return NaN;
  }

  function formatSessionTime(opts) {
    return formatDuration(sessionSeconds(opts));
  }

  function shownFixRate(v) {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return "N/A";
    return String(n);
  }

  function distMiles(km) {
    if (km == null || km === "") return "N/A";
    const n = parseFloat(km);
    if (isNaN(n)) return "N/A";
    return (n * 0.621371).toFixed(2) + " miles";
  }

  function selectionHtml(m) {
    m = m || {};
    const fixRate = shownFixRate(m.fixRate);
    const fixNum = parseFloat(String(m.fixPct == null ? "" : m.fixPct).replace("%", ""));
    const rateNum = parseFloat(fixRate);
    const fixColor = (!isNaN(fixNum) && fixNum >= 90) || (!isNaN(rateNum) && rateNum >= 90) ? "#3dcc7a" : "#edf2f7";
    const spp = m.spp || 0;
    const dgps = m.dgps || 0;
    const fixed = m.fixed || 0;
    const flt = m.floatCount || 0;
    const status = m.status == null || m.status === "" ? "N/A" : m.status;
    return [
      "<b>username:</b> " + esc(m.username || "N/A"),
      "<b>hardware:</b> " + esc(m.hardware || "Other"),
      "<b>station:</b> " + esc(m.station || "N/A"),
      "<b>fix %:</b> <span style=\"color:" + fixColor + "\">" + esc(m.fixPct || "N/A") + "</span>",
      "<b>float %:</b> " + esc(m.floatPct || "N/A"),
      "<b>less than float %:</b> " + esc(m.lessPct || "N/A"),
      "<b>Session time:</b> " + esc(m.sessionTime || "N/A"),
      "<b>start:</b> " + esc(m.start ? formatCst(m.start) : "N/A"),
      "<b>end:</b> " + esc(m.end ? formatCst(m.end) : "N/A"),
      "<b>point count:</b> " + esc(m.pointCount == null ? 0 : m.pointCount),
      "<b>Distance to Station:</b> " + esc(distMiles(m.distanceKm)),
      "<b>partner:</b> " + esc(m.partner || "N/A"),
      "<b>Sign in time (CST):</b> " + esc(m.signIn ? formatCst(m.signIn) : "N/A"),
      "<b>status:</b> " + esc(status),
      "<b>rtk fix rate(%):</b> <span style=\"color:" + fixColor + "\">" + esc(fixRate) + "</span>",
      "<b>spp / dgps / fixed / float:</b> " + esc(spp) + " / " + esc(dgps) + " / " + esc(fixed) + " / " + esc(flt),
      "<b>avg age / max age:</b> " + esc(m.avgAge || "N/A") + " / " + esc(m.maxAge || "N/A"),
      "<b>ip:</b> " + esc(m.ip || "N/A")
    ].join("<br>");
  }

  return {
    esc,
    formatDuration,
    formatCst,
    qualityShare,
    sessionSeconds,
    formatSessionTime,
    selectionHtml
  };
});
