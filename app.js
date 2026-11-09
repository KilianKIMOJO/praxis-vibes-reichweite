/* Praxis Vibes Analytics – zeichnet das Dashboard aus den (entschlüsselten) Daten.
   Wird von gate.js mit window.PV_START(daten) gestartet. */
(function () {
  "use strict";

  // ── Formatierung ──────────────────────────────────────────────────────────
  const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
  const MON = ["Jan", "Feb", "März", "Apr", "Mai", "Juni", "Juli", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const fnum = (v) => (v == null ? "–" : nf.format(v));
  const fpct = (p) => (p == null ? "–" : (p > 0 ? "+" : p < 0 ? "−" : "±") + nf.format(Math.abs(p * 100)) + " %");
  const signed = (v) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + nf.format(Math.abs(v)));
  const pd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fdate = (s) => { const d = pd(s); return `${d.getDate()}. ${MON[d.getMonth()]}`; };
  const kw = (wid) => +wid.split("-W")[1];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const $ = (id) => document.getElementById(id);
  function isoWeekId(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, "0")}`;
  }
  function deltaHtml(p, word) {
    if (p == null) return `<span class="delta flat">kein Vergleich</span>`;
    const cls = p > 0 ? "up" : p < 0 ? "down" : "flat";
    return `<span class="delta ${cls}">${p > 0 ? "▲" : p < 0 ? "▼" : "■"} ${fpct(p)}</span>${word ? ` <span>${word}</span>` : ""}`;
  }

  const RANGES = [
    { k: "2", n: 2, label: "14 Tage" }, { k: "4", n: 4, label: "4 Wochen" },
    { k: "13", n: 13, label: "3 Monate" }, { k: "26", n: 26, label: "6 Monate" },
    { k: "52", n: 52, label: "12 Monate" }, { k: "all", n: Infinity, label: "Gesamt" },
  ];

  window.PV_START = function (D) {
    // ── Wochen lückenlos vom ersten Datensatz bis zum Ende des Berichtszeitraums ──
    const byWeek = Object.fromEntries(D.weeks.map((w) => [w.week, w]));
    const allWeeks = [];
    for (let d = pd(D.weeks[0].start), end = pd(D.period.end); d <= end; d.setDate(d.getDate() + 7)) {
      const wid = isoWeekId(d);
      allWeeks.push({ week: wid, start: ymd(d), rec: byWeek[wid] || null });
    }
    // Nur bis zur letzten Woche mit Daten auswerten (das Excel wird mit etwas Verzug gepflegt)
    const hasData = (w) => w.rec && (Object.keys(w.rec.ig || {}).length || Object.keys(w.rec.pod || {}).length);
    while (allWeeks.length > 1 && !hasData(allWeeks[allWeeks.length - 1])) allWeeks.pop();
    const val = (w, sec, key) => (w.rec && w.rec[sec] && w.rec[sec][key] != null ? w.rec[sec][key] : null);
    const epByWeek = {};
    (D.episodes || []).forEach((e) => { const wid = isoWeekId(pd(e.date)); (epByWeek[wid] = epByWeek[wid] || []).push(e); });
    const weekEnd = (w) => { const e = pd(w.start); e.setDate(e.getDate() + 6); return ymd(e); };
    const weekTitle = (w) => `KW ${kw(w.week)} · ${fdate(w.start)} – ${fdate(weekEnd(w))}`;

    function sum(weeks, sec, key) {
      let s = 0, have = 0;
      weeks.forEach((w) => { const v = val(w, sec, key); if (v != null) { s += v; have++; } });
      return { sum: have ? s : null, have, n: weeks.length };
    }
    function last(weeks, sec, key) {
      for (let i = weeks.length - 1; i >= 0; i--) { const v = val(weeks[i], sec, key); if (v != null) return { v, w: weeks[i] }; }
      return { v: null, w: null };
    }
    const enough = (x) => x && x.sum != null && x.have >= Math.ceil(x.n / 2);
    function cmpRaw(cur, prev) {
      if (!enough(cur) || !enough(prev) || !prev.sum) return null;
      if (cur.have === cur.n && prev.have === prev.n) return { p: cur.sum / prev.sum - 1, avg: false };
      return { p: (cur.sum / cur.have) / (prev.sum / prev.have) - 1, avg: true };
    }
    const cmpHtml = (c, long) => (c ? deltaHtml(c.p, long ? (c.avg ? "Ø je Woche zum Zeitraum davor" : "zum Zeitraum davor") : (c.avg ? "Ø je Woche" : "")) : deltaHtml(null));

    // ── Kopf ───────────────────────────────────────────────────────────────
    const gen = new Date(D.generated);
    const lastW = allWeeks[allWeeks.length - 1];
    $("stand").textContent = `Daten bis KW ${kw(lastW.week)} (${fdate(weekEnd(lastW))}) · aktualisiert am ${gen.toLocaleDateString("de-DE")}`;
    let rangeKey = "13";
    try { rangeKey = localStorage.getItem("pv-range2") || "13"; } catch (e) { /* ohne Speicher */ }
    if (!RANGES.some((r) => r.k === rangeKey)) rangeKey = "13";
    $("range").innerHTML = RANGES.map((r) => `<button data-k="${r.k}">${r.label}</button>`).join("");

    // ── Datenstand und Hinweise (unabhängig vom Zeitraum) ─────────────────
    const st = D.status || {};
    $("status").innerHTML = [["Spotify for Creators", "spotify"], ["Instagram", "instagram"], ["Podcast-Feed", "feed"]].map(([n, k]) => {
      const s = st[k] || {}; const ok = !!s.ok;
      const txt = k === "feed" ? (ok ? "aktuell" : "nicht erreichbar") : ok ? "automatischer Abruf" : "Werte aus dem KPI-Tracking (Excel)";
      return `<li><span class="dot ${ok ? "ok" : "no"}"></span><div><b>${n}</b>: ${txt}<small>${esc(s.message || "")}</small></div></li>`;
    }).join("");
    $("hints").innerHTML = (D.hints && D.hints.length ? D.hints : ["Keine Auffälligkeiten."])
      .map((h) => `<li class="${/^Datencheck|läuft/.test(h) ? "warn" : ""}">${esc(h)}</li>`).join("");

    // Wochentabelle
    const cols = [["Wiedergaben", "pod", "plays"], ["Spotify-Foll. netto", "pod", "followers_net"], ["Erreichte Konten", "ig", "reach"],
      ["Views", "ig", "views"], ["Profilaufrufe", "ig", "profile_views"], ["Link-Klicks", "ig", "link_clicks"],
      ["IG-Follower", "ig", "followers"], ["IG netto", "ig", "net"]];
    $("weeks").innerHTML = `<thead><tr><th>Woche</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}<th>Quelle</th></tr></thead><tbody>` +
      allWeeks.slice().reverse().map((w) => `<tr><td>KW ${kw(w.week)} <span class="src">${w.week.slice(0, 4)}</span></td>${cols.map((c) => `<td>${fnum(val(w, c[1], c[2]))}</td>`).join("")}
        <td class="src">${w.rec ? [...new Set(Object.values(w.rec.sources || {}))].join(", ").replace("excel", "Excel").replace("api", "automatisch") || "–" : "keine Daten"}</td></tr>`).join("") + "</tbody>";

    // ── Diagramme ──────────────────────────────────────────────────────────
    const tip = $("tip");
    function showTip(evt, html) {
      tip.innerHTML = html; tip.style.opacity = 1;
      const r = tip.getBoundingClientRect();
      let x = evt.clientX + 14, y = evt.clientY - r.height - 10;
      if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - 14;
      if (y < 8) y = evt.clientY + 16;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    }
    const hideTip = () => { tip.style.opacity = 0; };
    const nice = (v) => { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; };
    const compact = (v) => (Math.abs(v) >= 10000 ? nf.format(v / 1000) + " Tsd." : nf.format(v));
    function barPath(x, y0, y1, w, round) {
      const h = Math.abs(y1 - y0); if (h < 0.5) return "";
      const r = round ? Math.min(4, h, w / 2) : 0, up = y1 < y0;
      if (!r) return `M${x},${y0}V${y1}H${x + w}V${y0}Z`;
      return up
        ? `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`
        : `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
    }

    /* opt: {type:'bar'|'line', series:[{get,color,label,unit}], band:Set(week), avg, episodes} */
    function chart(id, weeks, opt) {
      const plot = document.querySelector(`#${id} .plot`);
      const W = plot.clientWidth, H = plot.clientHeight, m = { l: 52, r: 12, t: 16, b: 26 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const S = opt.series;
      const rows = weeks.map((w) => S.map((s) => s.get(w)));
      const totals = rows.map((r) => (r.every((v) => v == null) ? null : r.reduce((a, v) => a + (v || 0), 0)));
      const have = (opt.type === "line" ? rows.map((r) => r[0]) : totals).filter((v) => v != null);
      if (!have.length) { plot.innerHTML = `<p class="empty" style="padding-top:90px;text-align:center">Für diesen Zeitraum noch keine Daten.</p>`; return; }
      let lo = opt.type === "line" ? Math.min(...have) : Math.min(0, ...have), hi = Math.max(...have);
      if (opt.type === "line") { const pad = (hi - lo) * 0.12 || 10; lo = Math.max(0, lo - pad); hi += pad; }
      const step = nice((hi - lo) / 4); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step || step;
      const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
      const bw = iw / weeks.length, x = (i) => m.l + i * bw;
      let s = "";
      if (opt.band && opt.band.size < weeks.length) {
        const idx = weeks.map((w, i) => (opt.band.has(w.week) ? i : -1)).filter((i) => i >= 0);
        if (idx.length) s += `<rect class="band" x="${x(idx[0])}" y="${m.t - 6}" width="${bw * idx.length}" height="${ih + 6}" rx="6"/>`;
      }
      for (let g = lo; g <= hi + step / 2; g += step) {
        s += `<line class="gl" x1="${m.l}" x2="${W - m.r}" y1="${y(g)}" y2="${y(g)}"/><text class="ax" x="${m.l - 8}" y="${y(g) + 4}" text-anchor="end">${compact(g)}</text>`;
      }
      const every = Math.max(1, Math.ceil(58 / bw));
      weeks.forEach((w, i) => {
        if ((weeks.length - 1 - i) % every) return;
        const lbl = kw(w.week) === 1 || i === 0 ? `KW ${kw(w.week)} ’${w.week.slice(2, 4)}` : `KW ${kw(w.week)}`;
        s += `<text class="ax" x="${x(i) + bw / 2}" y="${H - 6}" text-anchor="middle">${lbl}</text>`;
      });
      s += `<g class="hls"></g>`;
      if (opt.type === "bar") {
        const w = Math.max(2, Math.min(bw - 2, bw * 0.72));
        rows.forEach((r, i) => {
          if (totals[i] == null) { s += `<circle cx="${x(i) + bw / 2}" cy="${y(0)}" r="1.5" fill="${css("--muted")}"/>`; return; }
          let base = 0; const segs = r.map((v, j) => ({ v: v || 0, j })).filter((t) => t.v !== 0);
          segs.forEach((t, k) => {
            const top = k === segs.length - 1;
            const y0 = y(base), y1 = y(base + t.v);
            const gap = k > 0 && Math.abs(y1 - y0) > 3 ? 2 : 0; // 2px Fläche zwischen gestapelten Segmenten
            s += `<path d="${barPath(x(i) + (bw - w) / 2, y0 - (t.v > 0 ? gap : -gap), y1, w, top)}" fill="${css(S[t.j].color)}"/>`;
            base += t.v;
          });
        });
        if (lo < 0) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="${css("--muted")}"/>`;
      } else {
        let d = ""; rows.forEach((r, i) => { if (r[0] == null) return; d += `${d ? "L" : "M"}${x(i) + bw / 2},${y(r[0])}`; });
        s += `<path d="${d}" fill="none" stroke="${css(S[0].color)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        const li = rows.map((r, i) => [r[0], i]).filter((t) => t[0] != null).pop();
        s += `<circle cx="${x(li[1]) + bw / 2}" cy="${y(li[0])}" r="4" fill="${css(S[0].color)}" stroke="${css("--card")}" stroke-width="2"/>`;
        s += `<text class="avg-lbl" x="${Math.min(x(li[1]) + bw / 2, W - m.r)}" y="${y(li[0]) - 10}" text-anchor="end">${fnum(li[0])}</text>`;
      }
      if (opt.avg) {
        const a = have.reduce((p, v) => p + v, 0) / have.length;
        s += `<line class="avg" x1="${m.l}" x2="${W - m.r}" y1="${y(a)}" y2="${y(a)}"/><text class="avg-lbl" x="${W - m.r}" y="${y(a) - 6}" text-anchor="end">Ø ${fnum(a)}</text>`;
      }
      if (opt.episodes) weeks.forEach((w, i) => {
        if (!epByWeek[w.week]) return;
        const cx = x(i) + bw / 2, cy = y(0);
        s += `<path class="ep" d="M${cx},${cy - 6}L${cx + 6},${cy}L${cx},${cy + 6}L${cx - 6},${cy}Z"/>`;
      });
      weeks.forEach((w, i) => { s += `<rect class="hit" data-i="${i}" x="${x(i)}" y="${m.t}" width="${bw}" height="${ih}"/>`; });
      plot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label)}">${s}</svg>`;
      const svg = plot.querySelector("svg"), hls = svg.querySelector(".hls");
      svg.querySelectorAll(".hit").forEach((rect) => {
        const i = +rect.dataset.i, wk = weeks[i];
        rect.addEventListener("mousemove", (evt) => {
          hls.innerHTML = `<rect class="hl" x="${x(i)}" y="${m.t}" width="${bw}" height="${ih}"/>`;
          let body;
          if (totals[i] == null && (opt.type !== "line" || rows[i][0] == null)) body = "<b>keine Daten</b>";
          else if (S.length === 1) body = `<b>${fnum(rows[i][0])}</b> ${S[0].unit}`;
          else body = S.map((se, j) => `<div class="t-row"><span class="sw" style="background:${css(se.color)}"></span>${se.label}: <b>${fnum(rows[i][j])}</b></div>`).join("") + `<div class="t-row">Summe: <b>${fnum(totals[i])}</b></div>`;
          const eps = opt.episodes ? (epByWeek[wk.week] || []).map((e) => `<div class="t-sub">Neue Folge #${e.number ?? ""}: ${esc(e.title.slice(0, 60))}</div>`).join("") : "";
          showTip(evt, `<div class="t-sub">${weekTitle(wk)}</div>${body}${eps}`);
        });
        rect.addEventListener("mouseleave", () => { hls.innerHTML = ""; hideTip(); });
      });
    }

    // ── Zeitraumabhängiger Teil ───────────────────────────────────────────
    const tile = (lbl, v, sub) => `<div class="card tile"><div class="t-lbl">${lbl}</div><div class="t-val">${v}</div><div class="t-sub">${sub}</div></div>`;
    const covNote = (x, name) => (x.have < x.n ? `${name}: Daten für ${x.have} von ${x.n} Wochen` : "");

    function render() {
      const R = RANGES.find((r) => r.k === rangeKey);
      const n = Math.min(R.n, allWeeks.length);
      const P = allWeeks.slice(-n);
      const Q = R.n === Infinity || allWeeks.length < 2 * n ? null : allWeeks.slice(-2 * n, -n);
      const pStart = P[0].start, pEnd = weekEnd(P[P.length - 1]);
      document.querySelectorAll("#range button").forEach((b) => b.classList.toggle("on", b.dataset.k === rangeKey));
      $("range-note").textContent = `KW ${kw(P[0].week)}/${P[0].week.slice(2, 4)} bis KW ${kw(P[P.length - 1].week)}/${P[P.length - 1].week.slice(2, 4)} · ${fdate(pStart)} ${pd(pStart).getFullYear()} bis ${fdate(pEnd)} ${pd(pEnd).getFullYear()}` + (Q ? " · Vergleich mit dem gleich langen Zeitraum davor" : "");

      const reach = sum(P, "ig", "reach"), plays = sum(P, "pod", "plays");
      const reachQ = Q && sum(Q, "ig", "reach"), playsQ = Q && sum(Q, "pod", "plays");
      const total = reach.sum == null && plays.sum == null ? null : (reach.sum || 0) + (plays.sum || 0);
      let totalCmp = null;
      if (Q && enough(reach) && enough(plays) && enough(reachQ) && enough(playsQ)) {
        const full = [reach, plays, reachQ, playsQ].every((x) => x.have === x.n);
        const a = full ? reach.sum + plays.sum : reach.sum / reach.have + plays.sum / plays.have;
        const b = full ? reachQ.sum + playsQ.sum : reachQ.sum / reachQ.have + playsQ.sum / playsQ.have;
        totalCmp = b ? { p: a / b - 1, avg: !full } : null;
      }
      const notes = [covNote(reach, "Instagram-Reichweite"), covNote(plays, "Podcast-Wiedergaben")].filter(Boolean);

      // Hero
      $("hero").innerHTML = `<div class="lbl">Absolute Reichweite · ${R.label}</div>
        <div class="big">${fnum(total)}</div>
        <div class="row">${Q ? cmpHtml(totalCmp, true) : ""}</div>
        <div class="note">Instagram erreichte Konten plus Podcast-Wiedergaben, Summe der Wochenwerte. Dieselbe Person kann auf beiden Kanälen gezählt sein.</div>
        ${notes.length ? `<div class="note warn">${notes.join(" · ")}</div>` : ""}`;

      // Aufteilung
      const share = total ? [(reach.sum || 0) / total, (plays.sum || 0) / total] : [0, 0];
      $("split").innerHTML = `<div class="lbl">Aufteilung</div>
        <div class="split-row"><span class="k"><span class="sw" style="background:var(--ig)"></span>Instagram erreichte Konten</span><span class="mid">${fnum(reach.sum)}</span></div>
        <div class="row" style="justify-content:flex-end">${nf.format(share[0] * 100)} %${Q ? " · " + cmpHtml(cmpRaw(reach, reachQ)) : ""}</div>
        <div class="split-row"><span class="k"><span class="sw" style="background:var(--pod)"></span>Podcast-Wiedergaben</span><span class="mid">${fnum(plays.sum)}</span></div>
        <div class="row" style="justify-content:flex-end">${nf.format(share[1] * 100)} %${Q ? " · " + cmpHtml(cmpRaw(plays, playsQ)) : ""}</div>
        <div class="share" aria-hidden="true"><i style="width:${share[0] * 100}%;background:var(--ig)"></i><i style="width:${share[1] * 100}%;background:var(--pod)"></i></div>`;

      // Community
      const igF = last(P, "ig", "followers"), igNet = sum(P, "ig", "net");
      const spF = last(P, "pod", "followers"), spNet = sum(P, "pod", "followers_net");
      $("community").innerHTML = `<div class="lbl">Community</div>
        <div class="split-row"><span class="k"><span class="sw" style="background:var(--ig)"></span>Instagram-Follower</span><span class="mid">${fnum(igF.v)}</span></div>
        <div class="row" style="justify-content:flex-end">${signed(igNet.sum)} netto im Zeitraum</div>
        <div class="split-row"><span class="k"><span class="sw" style="background:var(--pod)"></span>Spotify-Follower</span><span class="mid">${spF.v != null ? fnum(spF.v) : signed(spNet.sum)}</span></div>
        <div class="row" style="justify-content:flex-end">${spF.v != null ? `${signed(spNet.sum)} netto im Zeitraum` : "netto im Zeitraum"}</div>
        ${spF.v == null ? `<div class="note">Der Gesamtstand der Spotify-Follower erscheint, sobald Spotify automatisch abgerufen wird.</div>` : ""}`;

      // Diagrammfenster: mindestens 12 Wochen, gewählter Zeitraum hinterlegt
      const CW = R.n === Infinity ? allWeeks : allWeeks.slice(-Math.max(n, 12));
      const band = new Set(P.map((w) => w.week));
      $("lg-abs").innerHTML = `<span><span class="sw" style="background:var(--ig)"></span>Instagram erreichte Konten</span><span><span class="sw" style="background:var(--pod)"></span>Podcast-Wiedergaben</span>`;
      chart("c-abs", CW, { type: "bar", band, label: "Absolute Reichweite je Woche", series: [
        { get: (w) => val(w, "ig", "reach"), color: "--ig", label: "Instagram" },
        { get: (w) => val(w, "pod", "plays"), color: "--pod", label: "Podcast" }] });

      // Podcast
      const eps = (D.episodes || []).filter((e) => e.date >= pStart && e.date <= pEnd);
      $("pod-tiles").innerHTML = [
        tile("Wiedergaben", fnum(plays.sum), Q ? cmpHtml(cmpRaw(plays, playsQ), true) : "seit Beginn der Erfassung"),
        tile("Ø Wiedergaben je Woche", plays.have ? fnum(plays.sum / plays.have) : "–", plays.have < plays.n ? `aus ${plays.have} Wochen mit Daten` : `über ${plays.n} Wochen`),
        tile("Spotify-Follower netto", signed(spNet.sum), spF.v != null ? `Stand ${fnum(spF.v)}` : "neue minus verlorene Follower"),
        tile("Neue Folgen", fnum(eps.length), eps.length ? `zuletzt #${eps[0].number ?? ""} am ${fdate(eps[0].date)}` : "im Zeitraum"),
      ].join("");
      chart("c-plays", CW, { type: "bar", band, avg: true, episodes: true, label: "Podcast-Wiedergaben je Woche",
        series: [{ get: (w) => val(w, "pod", "plays"), color: "--pod", unit: "Wiedergaben" }] });
      const shown = eps.slice(0, 12);
      $("eps").querySelector("tbody").innerHTML = shown.length ? shown.map((e) =>
        `<tr><td>${e.number != null ? "#" + e.number : ""}</td><td><a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a></td>
         <td>${fdate(e.date)}</td><td class="r">${e.plays_total != null ? fnum(e.plays_total) : "–"}</td></tr>`).join("") +
        (eps.length > shown.length ? `<tr><td></td><td class="empty" colspan="3">und ${eps.length - shown.length} weitere</td></tr>` : "")
        : `<tr><td colspan="4" class="empty">Keine neue Folge in diesem Zeitraum.</td></tr>`;

      // Instagram
      const views = sum(P, "ig", "views"), pv = sum(P, "ig", "profile_views"), lc = sum(P, "ig", "link_clicks");
      const fol = sum(P, "ig", "follows"), unf = sum(P, "ig", "unfollows");
      const Qs = (k) => Q && sum(Q, "ig", k);
      const sub = (x, k) => (Q ? cmpHtml(cmpRaw(x, Qs(k)), true) : "seit Beginn der Erfassung");
      $("ig-tiles").innerHTML = [
        tile("Erreichte Konten", fnum(reach.sum), sub(reach, "reach")),
        tile("Ø erreichte Konten je Woche", reach.have ? fnum(reach.sum / reach.have) : "–", reach.have < reach.n ? `aus ${reach.have} Wochen mit Daten` : `über ${reach.n} Wochen`),
        tile("Views", fnum(views.sum), sub(views, "views")),
        tile("Follower", fnum(igF.v), `${signed(igNet.sum)} netto im Zeitraum`),
        tile("Neue Follower", fnum(fol.sum), `${fnum(unf.sum)} verloren`),
        tile("Profilaufrufe", fnum(pv.sum), sub(pv, "profile_views")),
        tile("Link-Klicks", fnum(lc.sum), sub(lc, "link_clicks")),
        tile("Wiedergaben je 1.000 erreichte Konten", reach.sum && plays.sum != null ? nf1.format(plays.sum / reach.sum * 1000) : "–", "Brücke Instagram → Podcast"),
      ].join("");
      chart("c-reach", CW, { type: "bar", band, avg: true, label: "Instagram erreichte Konten je Woche",
        series: [{ get: (w) => val(w, "ig", "reach"), color: "--ig", unit: "erreichte Konten" }] });
      chart("c-igf", CW, { type: "line", band, label: "Instagram-Follower gesamt",
        series: [{ get: (w) => val(w, "ig", "followers"), color: "--ig", unit: "Follower" }] });
    }

    $("range").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      rangeKey = b.dataset.k; try { localStorage.setItem("pv-range2", rangeKey); } catch (err) { /* egal */ }
      render();
    });
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 120); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
    $("app").hidden = false;
    render();
  };
})();
