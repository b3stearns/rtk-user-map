(async () => {
  const me = await fetch("/api/me", { credentials: "same-origin" });
  if (me.status === 401) { location = "/login"; return; }

  let tracks = [], allData = [], allAlerts = [], bases = [], sel = null, selStation = null, lineG = null, mkG = null;
  const stationMarkers = [];
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
  function esc(s) { return TNStats.esc(s); }

  function todaySamples(tr) {
    const raw = dayPoints(tr).concat(liveTrail[key(tr)] || []);
    const seen = new Set();
    const out = [];
    raw.forEach(p => {
      if (!p || !isFinite(p.lat) || !isFinite(p.lng)) return;
      if (chicagoDay(p.t) !== chicagoDay()) return;
      const id = p.lat.toFixed(6) + "," + p.lng.toFixed(6) + "," + (p.t || 0);
      if (seen.has(id)) return;
      seen.add(id);
      out.push(p);
    });
    out.sort((a, b) => (a.t || 0) - (b.t || 0));
    return out;
  }

  function logsFor(tr) {
    const hw = brandId(tr);
    const today = chicagoDay();
    return (allData || []).filter(x => {
      if (String(x.username || "") !== String(tr.username || "")) return false;
      if ((x.hardware || "other") !== hw) return false;
      const t = Number(x.loginTime) || 0;
      return chicagoDay(t || Date.now()) === today;
    });
  }

  function formatSessionTime(tr) {
    const last = (tr && tr.last) || {};
    const lastToday = Number(last.loginTime) && chicagoDay(Number(last.loginTime)) === chicagoDay();
    return TNStats.formatSessionTime({
      duration: lastToday ? tr.duration : undefined,
      logs: logsFor(tr),
      points: todaySamples(tr),
      now: Date.now()
    });
  }

  function buildModel(tr) {
    const last = tr.last || {};
    const share = TNStats.qualityShare(todaySamples(tr));
    const shortStation = last.station ? String(last.station).slice(-4) : (tr.mount || "N/A");
    const matched = matchStation(tr);
    const stationLabel = matched && (matched.name || matched.station) ? (matched.name || matched.station) : shortStation;
    return {
      username: tr.username,
      hardware: brandLabel(tr),
      partner: last.partner,
      signIn: last.loginTime,
      start: share.start,
      end: share.end,
      sessionTime: formatSessionTime(tr),
      pointCount: share.n,
      status: last.status != null ? last.status : last.msg,
      fixPct: share.fixPct,
      floatPct: share.floatPct,
      lessPct: share.lessPct,
      fixRate: last.fixRate != null ? last.fixRate : (last.rtkfix != null ? last.rtkfix : last["rtk fix rate(%)"]),
      spp: last.spp,
      dgps: last.dgps,
      fixed: last.rtkFixed != null ? last.rtkFixed : last.rtkfix,
      floatCount: last.rtkFloat != null ? last.rtkFloat : last.float,
      avgAge: last.avgAge,
      maxAge: last.maxAge,
      ip: last.ip,
      distanceKm: last.distance,
      station: stationLabel
    };
  }

  function createLogPopup(tr) {
    return TNStats.selectionHtml(buildModel(tr));
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

  function stationKey(b) { return String((b && (b.id || b.name || b.station)) || ""); }

  function sessionsOnStation(b) {
    return tracks.filter(t => {
      const st = matchStation(t);
      if (!st) return false;
      if (b.id && st.id && st.id === b.id) return true;
      return String(st.name || "") === String(b.name || "") && String(b.name || "") !== "";
    });
  }

  function stationHtml(b) {
    const sessions = sessionsOnStation(b).map(t => createLogPopup(t));
    const head = `<div class="k">Selected station</div><b>station:</b> ${esc(b.name || b.station || "Station")}<br><b>state:</b> ${esc(b.state || "N/A")}<br><b>status:</b> ${esc(b.status || "N/A")}<br>`;
    if (!sessions.length) return head + `<div class="mt">No hardware on this station today</div>`;
    return head + sessions.map(html => `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(214,226,240,.12)">${html}</div>`).join("");
  }

  function showStationDetail(b) {
    const el = document.getElementById("detail");
    el.style.display = "block";
    el.innerHTML = stationHtml(b);
    if (!isCompact()) el.scrollIntoView({ block: "nearest" });
  }

  function refreshStationPopups() {
    if (!selStation) return;
    const hit = stationMarkers.find(s => stationKey(s.b) === selStation);
    if (!hit) return;
    hit.marker.setPopupContent(stationHtml(hit.b));
    if (hit.marker.isPopupOpen()) hit.marker.openPopup();
    showStationDetail(hit.b);
  }

  function selectStation(b) {
    sel = null;
    selStation = stationKey(b);
    if (lineG) { map.removeLayer(lineG); lineG = null; }
    renderList();
    markers();
    showStationDetail(b);
  }

  function plotStations(list) {
    bases = list || [];
    stationMarkers.length = 0;
    stationsLayer.clearLayers();
    ringSpecs.forEach(spec => ringLayers[spec.key].clearLayers());
    bases.forEach(b => {
      const lat = parseFloat(b.latitude != null ? b.latitude : b.lat);
      const lng = parseFloat(b.longitude != null ? b.longitude : b.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      const stable = String(b.status || "stable") === "stable";
      const marker = L.circleMarker([lat, lng], { color: "#1a73e8", fillColor: stable ? "#34a853" : "#1a73e8", fillOpacity: 0.9, radius: 6, weight: 2 });
      marker.bindPopup("<b>" + esc(b.name || b.station || "Station") + "</b>" + (b.state ? "<br>" + esc(b.state) : ""), { maxWidth: Math.max(200, Math.min(280, window.innerWidth - 48)), autoPanPadding: [16, 72] });
      marker.on("click", e => {
        L.DomEvent.stopPropagation(e);
        marker.setPopupContent(stationHtml(b));
        marker.openPopup();
        selectStation(b);
      });
      marker.addTo(stationsLayer);
      stationMarkers.push({ b, marker });
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
    const pts = todaySamples(tr);
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

  function markers() {
    if (mkG) map.removeLayer(mkG);
    mkG = L.layerGroup().addTo(map);
    for (const t of visibleTracks()) {
      const today = todaySamples(t);
      const p = today.length ? today[today.length - 1] : (t.points && t.points[t.points.length - 1]);
      if (!p) continue;
      const on = sel && key(t) === sel;
      const icon = L.divIcon({
        className: "hw-wrap",
        html: `<div class="hw-hit"><div class="hw-mk${t.live ? " live" : ""}${on ? " sel" : ""}"><img src="${esc(brandIcon(brandId(t)))}" alt="${esc(brandLabel(t))}" onerror="this.onerror=null;this.src='/brands/other.png'"></div></div>`,
        iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -22]
      });
      const m = L.marker([p.lat, p.lng], { icon, zIndexOffset: on ? 1000 : (t.live ? 400 : 0) });
      const popW = Math.max(200, Math.min(280, window.innerWidth - 48));
      m.bindPopup(createLogPopup(t), { maxWidth: popW, autoPanPadding: [16, 72], keepInView: true });
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
      const share = TNStats.qualityShare(todaySamples(t));
      return `<div class="u${on}" data-k="${esc(key(t))}"><div class="un"><img class="hw-li" src="${esc(brandIcon(brandId(t)))}" alt="">${esc(t.username)}${t.live ? ' <span class="pill">LIVE</span>' : ""}</div><div class="mt">${esc(brandLabel(t))} | ${esc(t.mount || "-")} | fix ${esc(share.fixPct)} | Session time ${esc(formatSessionTime(t))} | ${share.n} pts today</div></div>`;
    }).join("") : '<div class="empty">No RTK users in this window</div>';
    list.querySelectorAll(".u").forEach(el => { el.onclick = () => select(el.dataset.k, 1); });
  }

  function showDetail(tr) {
    const el = document.getElementById("detail");
    el.style.display = "block";
    el.innerHTML = `<div class="k">Selected hardware</div>${createLogPopup(tr)}`;
    if (!isCompact()) el.scrollIntoView({ block: "nearest" });
  }

  function renderAlerts(alerts) {
    const n = (alerts || []).length;
    const badge = document.getElementById("alertCount");
    badge.textContent = n;
    badge.classList.toggle("ok", n === 0);
    const box = document.getElementById("alertList");
    if (!n) {
      box.innerHTML = '<div class="empty">No NTRIP issues in this window.</div>';
      return;
    }
    box.innerHTML = alerts.map((a, i) => `
      <div class="al" data-i="${i}">
        <div class="cat">${esc(a.categoryLabel || a.category)}</div>
        <div class="un">${esc(a.username || "Unknown")}</div>
        <div class="mt">${esc(a.timeLabel || "")} · ${esc(a.station || a.mount || "—")}<br>${esc(a.msg || "")}</div>
      </div>`).join("");
    box.querySelectorAll(".al").forEach(el => {
      el.onclick = () => {
        const a = alerts[Number(el.dataset.i)];
        if (!a) return;
        const tr = tracks.find(t => t.username === a.username && (!a.hardware || brandId(t) === a.hardware))
          || tracks.find(t => t.username === a.username);
        if (tr) select(key(tr), 1);
        else if (a.latitude && a.longitude) {
          map.setView([a.latitude, a.longitude], 12);
          if (isCompact()) closePanel();
        }
      };
    });
  }

  function updateSummary(data) {
    const users = new Set(data.map(d => d.username).filter(Boolean));
    document.getElementById("sumUsers").textContent = users.size;
    const fixRates = data.map(d => parseFloat(d.fixRate ?? d.rtkfix ?? d["rtk fix rate(%)"] ?? d.rtkFixRate)).filter(n => !isNaN(n) && n > 0);
    const avgFix = fixRates.length ? (fixRates.reduce((a, b) => a + b, 0) / fixRates.length).toFixed(1) : "0";
    document.getElementById("sumFix").textContent = avgFix + "%";
    const dists = data.map(d => parseFloat(d.distance)).filter(n => !isNaN(n));
    const avgDistKm = dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : 0;
    document.getElementById("sumDist").textContent = (avgDistKm * 0.621371).toFixed(1) + " miles";
    const durations = data.map(d => parseFloat(d.duration)).filter(n => !isNaN(n));
    const totalHours = (durations.reduce((a, b) => a + b, 0) / 3600).toFixed(1);
    document.getElementById("sumTime").textContent = totalHours + " hrs";
  }

  function deselect() {
    sel = null;
    selStation = null;
    if (lineG) { map.removeLayer(lineG); lineG = null; }
    stationMarkers.forEach(s => s.marker.closePopup());
    document.getElementById("detail").style.display = "none";
    renderList();
    markers();
  }

  function select(k, fit) {
    sel = k;
    selStation = null;
    const tr = tracks.find(t => key(t) === k);
    if (!tr) return;
    stationMarkers.forEach(s => s.marker.closePopup());
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
      refreshStationPopups();
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
    document.getElementById("nlive").textContent = tracks.filter(t => t.live).length;
    updateSummary(allData);
    renderAlerts(allAlerts);
    renderList();
    markers();
    refreshStationPopups();
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
  document.getElementById("hwFilter").onchange = () => {
    if (sel) {
      const tr = tracks.find(t => key(t) === sel);
      const hw = document.getElementById("hwFilter").value;
      if (tr && hw && brandId(tr) !== hw) deselect();
    }
    renderList();
    markers();
  };
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
  map.on("click", e => {
    const t = e.originalEvent && e.originalEvent.target;
    if (t && t.closest && t.closest(".hw-mk, .leaflet-popup, .leaflet-marker-icon")) return;
    if (sel || selStation) deselect();
  });

  await loadWindow(1);
  pullLiveRtk();
  setInterval(pullLiveRtk, 3000);
  setInterval(() => loadWindow(0), 60000);
})();
