(async () => {
  const me = await fetch("/api/me", { credentials: "same-origin" });
  if (me.status === 401) { location = "/login"; return; }

  let tracks = [], allData = [], allAlerts = [], bases = [], sel = null, lineG = null, mkG = null;
  const liveTrail = {};
  const BRAND_ICONS = {
    "john-deere": "/brands/john-deere.png", trimble: "/brands/trimble.png", fjd: "/brands/fjd.png",
    dji: "/brands/dji.png", cnh: "/brands/cnh.png", topcon: "/brands/topcon.png", outback: "/brands/outback.png",
    raven: "/brands/raven.png", "ag-leader": "/brands/ag-leader.svg", emlid: "/brands/emlid.svg",
    agco: "/brands/agco.svg", other: "/brands/other.png"
  };
  const brandIcon = id => BRAND_ICONS[id] || BRAND_ICONS.other;
  const brandLabel = tr => tr.hardwareLabel || (tr.last && tr.last.hardwareLabel) || "Other";
  const brandId = tr => tr.hardware || (tr.last && tr.last.hardware) || "other";
  const key = t => t.username + "|" + (t.hardware || brandId(t) || "other");
  const chicagoDay = ms => new Date(ms || Date.now()).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const dayPoints = tr => (tr.points || []).filter(p => isFinite(p.lat) && isFinite(p.lng) && chicagoDay(p.t) === chicagoDay());
  const rtkColor = q => q === 4 ? "#22c55e" : q === 5 ? "#eab308" : "#ef4444";
  function esc(s) { return String(s); }

  function fmtClock(ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function fmtDur(sec) {
    const n = Number(sec);
    if (!isFinite(n) || n === 0) return "—";
    const s = Math.abs(n);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h && m) return h + "h " + m + "m";
    if (h) return h + "h";
    if (m) return m + "m";
    return Math.max(1, Math.round(s)) + "s";
  }
  function haversineMi(a, b) {
    const R = 3958.8;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function trackPts(tr) {
    const pts = dayPoints(tr).concat(liveTrail[key(tr)] || []).filter(p => isFinite(p.lat) && isFinite(p.lng));
    pts.sort((a, b) => (a.t || 0) - (b.t || 0));
    return pts;
  }
  function trackStats(tr) {
    const pts = trackPts(tr);
    const last = tr.last || {};
    let fix = 0, flt = 0, poor = 0;
    pts.forEach(p => {
      if (p.q === 4) fix++;
      else if (p.q === 5) flt++;
      else poor++;
    });
    const n = pts.length;
    const pct = c => n ? Math.round((c / n) * 1000) / 10 : 0;
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += haversineMi(pts[i - 1], pts[i]);
    const t0 = pts[0] && pts[0].t;
    const t1 = pts.length ? (pts[pts.length - 1].t || Date.now()) : 0;
    const spanSec = t0 && t1 && t1 >= t0 ? (t1 - t0) / 1000 : 0;
    const lastDur = parseFloat(tr.duration != null ? tr.duration : last.duration);
    const sessionSec = (!isNaN(lastDur) && lastDur > 0) ? lastDur : spanSec;
    return {
      pts, n, fix, flt, poor,
      fixPct: pct(fix), floatPct: pct(flt), poorPct: pct(poor),
      dist, t0, t1, sessionSec, lastDur
    };
  }

  const compactMq = window.matchMedia("(max-width: 860px), (max-height: 520px)");
  const isCompact = () => compactMq.matches;
  function openPanel() {
    document.body.classList.add("panel-open");
    document.getElementById("menuBtn").setAttribute("aria-expanded", "true");
    document.getElementById("scrim").hidden = false;
  }
  function closePanel() {
    document.body.classList.remove("panel-open");
    document.getElementById("menuBtn").setAttribute("aria-expanded", "false");
    document.getElementById("scrim").hidden = true;
    setTimeout(() => map.invalidateSize(), 240);
  }

  const map = L.map("map", { zoomControl: true, tapTolerance: 15 }).setView([45.5, -100], 6);
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri" });
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OSM" });
  sat.addTo(map);
  const MI = 1609.344;
  const ringSpecs = [
    { key: "< 1 cm", miles: 35, color: "#0f766e" },
    { key: "1–2.5 cm", miles: 51, color: "#0369a1" },
    { key: "2.6–6.2 cm", miles: 61, color: "#0e7490" },
    { key: "6.3–10 cm", miles: 90, color: "#44403c" }
  ];
  const stationsLayer = L.layerGroup();
  const ringLayers = {};
  ringSpecs.forEach(spec => { ringLayers[spec.key] = L.layerGroup(); });
  stationsLayer.addTo(map);
  const overlays = { Stations: stationsLayer };
  ringSpecs.forEach(spec => { overlays[spec.key] = ringLayers[spec.key]; });
  L.control.layers({ Satellite: sat, Street: osm }, overlays, { position: "topright" }).addTo(map);

  function plotStations(list) {
    bases = list || [];
    stationsLayer.clearLayers();
    ringSpecs.forEach(spec => ringLayers[spec.key].clearLayers());
    bases.forEach(b => {
      const lat = parseFloat(b.latitude != null ? b.latitude : b.lat);
      const lng = parseFloat(b.longitude != null ? b.longitude : b.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      const stable = String(b.status || "stable") === "stable";
      L.circleMarker([lat, lng], { color: "#1a73e8", fillColor: stable ? "#34a853" : "#1a73e8", fillOpacity: 0.9, radius: 6, weight: 2 })
        .bindPopup("<b>" + esc(b.name || b.station || "Station") + "</b>" + (b.state ? "<br>" + esc(b.state) : ""))
        .addTo(stationsLayer);
      ringSpecs.forEach(spec => {
        L.circle([lat, lng], { radius: spec.miles * MI, color: spec.color, weight: 1, fillColor: spec.color, fillOpacity: 0.04, opacity: 0.35 }).addTo(ringLayers[spec.key]);
      });
    });
  }
  fetch("/api/bases", { credentials: "same-origin" }).then(r => r.ok ? r.json() : { data: [] }).then(j => plotStations(j.data || [])).catch(() => {});

  function matchStation(tr) {
    const last = (tr && tr.last) || {};
    const ignore = /^(AUTO|NONE|N\/A)$/i;
    const keys = [];
    [tr && tr.mount, last.station, last.mountpoint, last.mount].forEach(v => {
      const s = String(v || "").replace(/^\*+/, "").trim().toUpperCase();
      if (s && !ignore.test(s) && keys.indexOf(s) < 0) keys.push(s);
    });
    if (!keys.length || !bases.length) return null;
    let best = null, bestScore = 0;
    bases.forEach(b => {
      const tokens = [b.name, b.station, b.mount, b.id].map(v => String(v || "").replace(/^\*+/, "").trim().toUpperCase()).filter(t => t && t.length >= 3 && !ignore.test(t));
      tokens.forEach(token => keys.forEach(k => {
        let score = 0;
        if (token === k) score = 10000 + token.length;
        else if (k.endsWith(token) && token.length >= 4) score = 5000 + token.length;
        else if (token.endsWith(k) && k.length >= 4) score = 4000 + k.length;
        if (score > bestScore) { bestScore = score; best = b; }
      }));
    });
    return bestScore >= 4000 ? best : null;
  }

  function drawStationLine(tr, fit) {
    if (lineG) { map.removeLayer(lineG); lineG = null; }
    const pts = trackPts(tr);
    if (!pts.length) return;
    lineG = L.layerGroup().addTo(map);
    const linePts = pts.map(p => [p.lat, p.lng]);
    if (linePts.length >= 2) {
      L.polyline(linePts, { color: "#22d3ee", weight: 4, opacity: 0.75 }).addTo(lineG);
      for (let i = 1; i < pts.length; i++) {
        L.polyline([[pts[i - 1].lat, pts[i - 1].lng], [pts[i].lat, pts[i].lng]], { color: rtkColor(pts[i].q), weight: 3, opacity: 0.95 }).addTo(lineG);
      }
    }
    pts.forEach(p => {
      L.circleMarker([p.lat, p.lng], { radius: 5, color: "#0b1220", weight: 1, fillColor: rtkColor(p.q), fillOpacity: 1 }).addTo(lineG);
    });
    const lastPt = pts[pts.length - 1];
    const st = matchStation(tr);
    const slat = st ? parseFloat(st.latitude != null ? st.latitude : st.lat) : NaN;
    const slng = st ? parseFloat(st.longitude != null ? st.longitude : st.lng) : NaN;
    if (isFinite(slat) && isFinite(slng)) {
      L.polyline([[lastPt.lat, lastPt.lng], [slat, slng]], { color: "#3dcc7a", weight: 2, opacity: 0.7, dashArray: "6 6" }).addTo(lineG);
    }
    if (fit) {
      const b = linePts.slice();
      if (isFinite(slat) && isFinite(slng)) b.push([slat, slng]);
      if (b.length) map.fitBounds(b, { padding: [48, 48], maxZoom: 16 });
    }
  }

  function visibleTracks() {
    const hw = document.getElementById("hwFilter").value;
    return tracks.filter(t => !hw || brandId(t) === hw);
  }

  function detailHtml(tr) {
    const s = trackStats(tr);
    const st = matchStation(tr);
    return `<b>${esc(tr.username)}</b>${tr.live ? ' <span class="pill">LIVE</span>' : ""}<br>` +
      `${esc(brandLabel(tr))}<br>` +
      `Station: ${esc((st && (st.name || st.station)) || tr.mount || "-")}<br>` +
      `Fix: <b style="color:#22c55e">${s.fixPct}%</b> · Float: <b style="color:#eab308">${s.floatPct}%</b> · Other: <b style="color:#ef4444">${s.poorPct}%</b><br>` +
      `Session: ${fmtDur(s.sessionSec)} · ${s.n} pts today<br>` +
      `Start: ${fmtClock(s.t0)}<br>` +
      `End: ${tr.live ? "live" : fmtClock(s.t1)}<br>` +
      `Distance: ${s.dist ? s.dist.toFixed(2) + " mi" : "—"}`;
  }

  function markers() {
    if (mkG) map.removeLayer(mkG);
    mkG = L.layerGroup().addTo(map);
    for (const t of visibleTracks()) {
      const today = trackPts(t);
      const p = today.length ? today[today.length - 1] : (t.points && t.points[t.points.length - 1]);
      if (!p) continue;
      const on = sel && key(t) === sel;
      const icon = L.divIcon({
        className: "hw-wrap",
        html: `<div class="hw-hit"><div class="hw-mk${t.live ? " live" : ""}${on ? " sel" : ""}"><img src="${esc(brandIcon(brandId(t)))}" alt="${esc(brandLabel(t))}" onerror="this.onerror=null;this.src='/brands/other.png'"></div></div>`,
        iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -22]
      });
      const m = L.marker([p.lat, p.lng], { icon, zIndexOffset: on ? 1000 : (t.live ? 400 : 0) });
      m.bindPopup(detailHtml(t));
      m.on("click", e => { L.DomEvent.stopPropagation(e); select(key(t), 1); });
      m.addTo(mkG);
      if (on) m.openPopup();
    }
  }

  function renderList() {
    const f = document.getElementById("q").value.trim().toLowerCase();
    const rows = visibleTracks().filter(t => !f || t.username.toLowerCase().includes(f) || brandLabel(t).toLowerCase().includes(f));
    const list = document.getElementById("list");
    list.innerHTML = rows.length ? rows.map(t => {
      const on = sel === key(t) ? " on" : "";
      const s = trackStats(t);
      return `<div class="u${on}" data-k="${esc(key(t))}"><div class="un"><img class="hw-li" src="${esc(brandIcon(brandId(t)))}" alt="">${esc(t.username)}${t.live ? ' <span class="pill">LIVE</span>' : ""}</div><div class="mt">${esc(brandLabel(t))} | ${esc(t.mount || "-")} | ${s.fixPct}% fix | ${fmtDur(s.sessionSec)}</div></div>`;
    }).join("") : '<div class="empty">No RTK users in this window</div>';
    list.querySelectorAll(".u").forEach(el => { el.onclick = () => select(el.dataset.k, 1); });
  }

  function renderAlerts() {
    const box = document.getElementById("alertList");
    const count = document.getElementById("alertCount");
    const rows = allAlerts || [];
    count.textContent = String(rows.length);
    count.classList.toggle("ok", !rows.length);
    if (!rows.length) {
      box.innerHTML = '<div class="empty">No NTRIP alerts</div>';
      return;
    }
    box.innerHTML = rows.slice(0, 40).map(a => {
      const k = tracks.find(t => t.username === a.username);
      return `<div class="al" data-user="${esc(a.username)}" data-k="${k ? esc(key(k)) : ""}"><div class="cat">${esc(a.categoryLabel || a.category || "alert")}</div><div>${esc(a.username)} · ${esc(a.mount || a.station || "-")}</div><div class="mt">${esc(a.timeLabel || "")} ${esc(a.msg || "")}</div></div>`;
    }).join("");
    box.querySelectorAll(".al").forEach(el => {
      el.onclick = () => { if (el.dataset.k) select(el.dataset.k, 1); };
    });
  }

  function renderSummary() {
    const vis = visibleTracks();
    const users = new Set(vis.map(t => t.username));
    let fixN = 0, totN = 0, dist = 0, time = 0;
    vis.forEach(t => {
      const s = trackStats(t);
      fixN += s.fix;
      totN += s.n;
      dist += s.dist;
      time += s.sessionSec || 0;
    });
    document.getElementById("sumUsers").textContent = String(users.size);
    document.getElementById("sumFix").textContent = totN ? (Math.round((fixN / totN) * 1000) / 10) + "%" : "—";
    document.getElementById("sumDist").textContent = dist ? dist.toFixed(1) + " mi" : "—";
    document.getElementById("sumTime").textContent = time ? fmtDur(time) : "—";
    document.getElementById("nlive").textContent = vis.filter(t => t.live).length;
  }

  function showDetail(tr) {
    const el = document.getElementById("detail");
    el.style.display = "block";
    const s = trackStats(tr);
    const st = matchStation(tr);
    const last = tr.last || {};
    el.innerHTML = `<div class="k">Selected session</div>
      <div><b>username:</b> ${esc(tr.username)}${tr.live ? ' <span class="pill">LIVE</span>' : ""}</div>
      <div><b>hardware:</b> ${esc(brandLabel(tr))}</div>
      <div><b>station:</b> ${esc((st && (st.name || st.station)) || tr.mount || last.station || "-")}</div>
      <div><b>fix:</b> <span style="color:#22c55e">${s.fixPct}%</span> (${s.fix}/${s.n})</div>
      <div><b>float:</b> <span style="color:#eab308">${s.floatPct}%</span> (${s.flt})</div>
      <div><b>other:</b> <span style="color:#ef4444">${s.poorPct}%</span> (${s.poor})</div>
      <div><b>session time:</b> ${fmtDur(s.sessionSec)}</div>
      <div><b>start:</b> ${fmtClock(s.t0)}</div>
      <div><b>end:</b> ${tr.live ? "live now" : fmtClock(s.t1)}</div>
      <div><b>distance:</b> ${s.dist ? s.dist.toFixed(2) + " mi" : "—"}</div>
      <div><b>today points:</b> ${s.n}</div>`;
  }

  function deselect() {
    sel = null;
    if (lineG) { map.removeLayer(lineG); lineG = null; }
    document.getElementById("detail").style.display = "none";
    renderList();
    markers();
  }

  function select(k, fit) {
    sel = k;
    const tr = tracks.find(t => key(t) === k);
    if (!tr) return;
    renderList();
    markers();
    drawStationLine(tr, fit);
    showDetail(tr);
    if (fit && isCompact()) closePanel();
  }

  async function pullLiveRtk() {
    try {
      const r = await fetch("/api/rtk", { credentials: "same-origin" });
      if (!r.ok) return;
      const j = await r.json();
      (j.rovers || []).forEach(rv => {
        const lat = parseFloat(rv.lat != null ? rv.lat : rv.latitude);
        const lng = parseFloat(rv.lon != null ? rv.lon : rv.lng != null ? rv.lng : rv.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return;
        const q = parseInt(rv.quality, 10);
        const tms = (rv.last_t > 1e12 ? rv.last_t : (rv.last_t || 0) * 1000) || Date.now();
        if (chicagoDay(tms) !== chicagoDay()) return;
        const tr = tracks.find(x => String(x.username || "").toLowerCase() === "mtirtk" && x.live)
          || tracks.find(x => String(x.username || "").toLowerCase() === "mtirtk")
          || tracks.find(x => x.live);
        if (!tr) return;
        const k = key(tr);
        const arr = liveTrail[k] || [];
        const last = arr[arr.length - 1];
        if (last && Math.abs(last.lat - lat) < 1e-7 && Math.abs(last.lng - lng) < 1e-7) return;
        arr.push({ lat, lng, t: tms, q: isNaN(q) ? null : q });
        if (arr.length > 4000) arr.splice(0, arr.length - 4000);
        liveTrail[k] = arr;
        tr.live = true;
      });
      markers();
      renderSummary();
      if (sel) {
        const tr = tracks.find(x => key(x) === sel);
        if (tr) { drawStationLine(tr, 0); showDetail(tr); }
      }
    } catch (e) {}
  }

  async function loadWindow(fitAll) {
    const hours = parseInt(document.getElementById("timeFilter").value, 10) || 12;
    const r = await fetch("/api/sheets?hours=" + hours, { credentials: "same-origin" });
    if (r.status === 401) { location = "/login"; return; }
    const json = await r.json();
    allData = json.data || [];
    allAlerts = json.alerts || [];
    tracks = json.tracks || [];
    document.getElementById("ref").textContent = new Date().toLocaleTimeString();
    renderAlerts();
    renderSummary();
    renderList();
    markers();
    if (sel) {
      const tr = tracks.find(t => key(t) === sel);
      if (tr) { drawStationLine(tr, 0); showDetail(tr); }
      else deselect();
    }
    if (fitAll && tracks.length) {
      const b = [];
      tracks.forEach(t => dayPoints(t).forEach(p => b.push([p.lat, p.lng])));
      if (b.length) map.fitBounds(b, { padding: [40, 40], maxZoom: 11 });
    }
  }

  document.getElementById("q").oninput = renderList;
  document.getElementById("hwFilter").onchange = () => { renderList(); markers(); renderSummary(); };
  document.getElementById("timeFilter").onchange = () => loadWindow(0);
  document.getElementById("out").onclick = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    location = "/login";
  };
  document.getElementById("menuBtn").onclick = () => {
    document.body.classList.contains("panel-open") ? closePanel() : openPanel();
  };
  document.getElementById("sideClose").onclick = closePanel;
  document.getElementById("scrim").onclick = closePanel;
  map.on("click", deselect);

  await loadWindow(1);
  pullLiveRtk();
  setInterval(pullLiveRtk, 3000);
  setInterval(() => loadWindow(0), 60000);
})();
