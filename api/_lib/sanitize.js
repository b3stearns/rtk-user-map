const DROP_KEYS = /^(request|password|passwd|pwd|authorization|authheader|appkey|app_key|appid|app_id|sign|secret)$/i;

function sanitizeLog(log) {
  if (!log || typeof log !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(log)) {
    if (DROP_KEYS.test(k)) continue;
    if (typeof v === "string" && /authorization\s*:/i.test(v)) continue;
    out[k] = v;
  }
  return out;
}

module.exports = { sanitizeLog };
