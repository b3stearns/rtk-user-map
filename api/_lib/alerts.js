function chicagoTime(ms) {
  const n = Number(ms);
  if (!n || isNaN(n)) return "N/A";
  try {
    return new Date(n).toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CST";
  } catch {
    return "N/A";
  }
}

function blob(log) {
  return [
    log && log.msg,
    log && log.status,
    log && log.userAgent,
    log && log.request
  ].map(v => (v == null ? "" : String(v))).join(" ").toLowerCase();
}

function isAuthFailure(log) {
  const t = blob(log);
  return /auth|unauthorized|password|login fail|\b401\b/.test(t);
}

function isBadMount(log) {
  const mount = String((log && (log.mountpoint || log.mount)) || "").trim();
  const station = String((log && log.station) || "").trim();
  if (!mount && !station) return true;
  const t = String((log && log.msg) || "").toLowerCase();
  return /\bmount\b|not found|invalid mount/.test(t);
}

function isDisconnect(log) {
  const dur = parseFloat(log && log.duration);
  if (!isNaN(dur) && dur < 0) return true;
  const t = String((log && log.msg) || "").toLowerCase();
  return /disconnect|timeout|close|drop/.test(t);
}

function isFailed(log) {
  const msg = String((log && log.msg) || "");
  const status = log && log.status;
  const msgOk = msg.toLowerCase() === "success";
  const statusOk = status === 0 || status === "0";
  return !msgOk || !statusOk;
}

function categoryFor(log) {
  if (isAuthFailure(log)) return "auth";
  if (isBadMount(log)) return "mount";
  if (isDisconnect(log)) return "disconnect";
  if (isFailed(log)) return "failed";
  return null;
}

const CATEGORY_LABELS = {
  auth: "Auth failure",
  mount: "Bad mount",
  disconnect: "Disconnect / short session",
  failed: "Failed / unsuccessful"
};

function classifyAlerts(logs) {
  const seen = new Set();
  const alerts = [];
  (logs || []).forEach(log => {
    const category = categoryFor(log);
    if (!category) return;
    const username = (log && log.username) || "Unknown";
    const time = Number(log && log.loginTime) || 0;
    const station = (log && (log.station || log.mountpoint)) || "";
    const msg = (log && (log.msg || log.status)) || "";
    const key = [username, time, station, String(msg), category].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push({
      id: (log && log.id) || key,
      username,
      time,
      timeLabel: chicagoTime(time),
      station: log && log.station || "",
      mount: log && (log.mountpoint || log.mount) || "",
      msg: String(msg),
      category,
      categoryLabel: CATEGORY_LABELS[category],
      latitude: log && log.latitude,
      longitude: log && log.longitude
    });
  });
  alerts.sort((a, b) => (b.time || 0) - (a.time || 0));
  return alerts;
}

module.exports = {
  classifyAlerts,
  categoryFor,
  CATEGORY_LABELS,
  chicagoTime
};
