/* Holocron GAC browser collector v1.2
 * Run on a normal, successfully loaded https://swgoh.gg/tier-list/ page.
 * It fetches same-origin tier-list views using the browser session and downloads
 * gac-browser-export.json. Missing rows are never interpreted as zero.
 */
(async function () {
  "use strict";
  const BASE = location.origin;
  const LEAGUES = ["kyber", "aurodium", "chromium", "bronzium", "carbonite"];
  const SIDES = ["offense", "defense"];
  const FORMATS = ["5v5", "3v3"];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const numberValue = value => {
    const m = String(value).replace(/,/g, "").replace(/\s/g, "").match(/^(\d+(?:\.\d+)?)([KMB]?)$/i);
    if (!m) throw new Error("Nombre de batailles illisible : " + value);
    return Math.round(Number(m[1]) * ({ "": 1, K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()]));
  };
  const parseSeason = (doc, fmt) => {
    const text = doc.body.innerText || "";
    const re = fmt === "5v5" ? /5s\s*\(S(\d+)\)/i : /3s\s*\(S(\d+)\)/i;
    const m = text.match(re) || text.match(/Season\s+(\d+)/i);
    if (!m) throw new Error("Saison introuvable pour " + fmt);
    return Number(m[1]);
  };
  const parseUnitView = (html, url, fmt, side, league) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (/Sorry, you have been blocked|Just a moment\.\.\./i.test(doc.body.innerText || "")) {
      throw new Error("Cloudflare bloque la vue " + fmt + "/" + side + "/" + league);
    }
    const season = parseSeason(doc, fmt);
    const rows = [];
    let role = "unknown";
    const sequence = Array.from(doc.querySelectorAll("h1,h2,h3,h4,a"));
    for (const el of sequence) {
      if (/^Leaders\b/i.test((el.innerText || "").trim())) { role = "leader"; continue; }
      if (/^Members\b/i.test((el.innerText || "").trim())) { role = "member"; continue; }
      if (el.tagName !== "A") continue;
      const label = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      const m = label.match(/^\s*\d+\s*(?:(?:▲|▼|—)\s*\d+|NEW)?\s*(.*?)\s+([35])s\s+(Offense|Defense)(?:\s+Datacron dependent)?\s+([\d,]+)\s+Rating\s+([\d,.]+\s*[KMB]?)\s+battles\s*$/i);
      if (!m) continue;
      const rowFormat = m[2] === "5" ? "5v5" : "3v3";
      const rowSide = m[3].toLowerCase();
      if (rowFormat !== fmt || rowSide !== side) continue;
      let name = m[1].trim().replace(/^[SABCD]→[SABCD]\s*/i, "");
      if (!name) continue;
      rows.push({ name, format: rowFormat, side: rowSide, role, rating: Number(m[4].replace(/,/g, "")), battles: numberValue(m[5]) });
    }
    const unique = new Map();
    for (const row of rows) {
      const key = row.name.toLocaleLowerCase();
      const old = unique.get(key);
      if (!old || row.battles > old.battles) unique.set(key, row);
    }
    return { format: fmt, side, league, season, url, rows: Array.from(unique.values()) };
  };
  const parseFleetView = (html, url, side, league) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (/Sorry, you have been blocked|Just a moment\.\.\./i.test(doc.body.innerText || "")) {
      throw new Error("Cloudflare bloque la vue flotte/" + side + "/" + league);
    }
    const seasonMatch = (doc.body.innerText || "").match(/Season\s+(\d+)/i);
    if (!seasonMatch) throw new Error("Saison flotte introuvable");
    const seen = new Set();
    const fleets = [];
    for (const img of Array.from(doc.querySelectorAll("img[alt]"))) {
      const ship = (img.getAttribute("alt") || "").replace(/^Image:\s*/i, "").trim();
      if (!ship) continue;
      let card = img.parentElement;
      for (let depth = 0; card && depth < 8; depth++, card = card.parentElement) {
        const text = (card.innerText || "").replace(/\s+/g, " ");
        const battlesMatch = text.match(/\bBattles\s+([\d,.]+\s*[KMB]?)\b/i);
        const rankMatch = text.match(/#\s*(\d+)\b/);
        if (!battlesMatch || !rankMatch) continue;
        const ships = Array.from(card.querySelectorAll("img[alt]"))
          .map(node => (node.getAttribute("alt") || "").replace(/^Image:\s*/i, "").trim())
          .filter(Boolean);
        const cleanShips = Array.from(new Set(ships));
        if (cleanShips.length < 3 || cleanShips.length > 8) continue;
        const key = side + "|" + league + "|" + rankMatch[1];
        if (seen.has(key)) break;
        seen.add(key);
        fleets.push({ rank: Number(rankMatch[1]), side, league, battles: numberValue(battlesMatch[1]), ships: cleanShips });
        break;
      }
    }
    return { side, league, season: Number(seasonMatch[1]), url, fleets };
  };
  const fetchPage = async url => {
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(url, { credentials: "include", cache: "no-store" });
        if (!response.ok) {
          const error = new Error("HTTP " + response.status + " sur " + url);
          error.status = response.status;
          if (response.status === 403 || response.status === 401 || (response.status < 500 && response.status !== 429)) throw error;
          lastError = error;
        } else {
          const html = await response.text();
          if (/Sorry, you have been blocked|Just a moment\.\.\.|Attention Required! \| Cloudflare/i.test(html.slice(0, 12000))) {
            throw new Error("Défi Cloudflare reçu pour " + url);
          }
          if (html.length < 1000) throw new Error("Réponse anormalement courte (" + html.length + " caractères) pour " + url);
          return html;
        }
      } catch (error) {
        lastError = error;
        if (error.status === 403 || error.status === 401 || /Défi Cloudflare/.test(error.message || "")) throw error;
      }
      if (attempt < 3) {
        const delay = Math.min(8000, 1000 * (2 ** attempt));
        status.textContent = "Holocron : nouvelle tentative " + (attempt + 2) + "/4 dans " + (delay / 1000) + " s…";
        await sleep(delay);
      }
    }
    throw new Error("Échec après 4 tentatives : " + (lastError?.message || url));
  };
  const CACHE_KEY = "holocron-gac-collector-v1.2";
  const CACHE_TTL = 12 * 60 * 60 * 1000;
  let checkpoint = { views: [], fleetViews: [], savedAt: Date.now() };
  try {
    const saved = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (saved && Date.now() - Number(saved.savedAt || 0) < CACHE_TTL) checkpoint = saved;
  } catch (_) {}
  const views = Array.isArray(checkpoint.views) ? checkpoint.views : [];
  const fleetViews = Array.isArray(checkpoint.fleetViews) ? checkpoint.fleetViews : [];
  const saveCheckpoint = () => {
    checkpoint = { views, fleetViews, savedAt: Date.now() };
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(checkpoint)); } catch (_) {}
  };
  const viewIsValid = view => view && Number(view.season) > 0 && Array.isArray(view.rows) && view.rows.length >= 8;
  const fleetViewIsValid = view => view && Number(view.season) > 0 && Array.isArray(view.fleets);
  const total = FORMATS.length * SIDES.length * LEAGUES.length + SIDES.length * LEAGUES.length;
  let done = 0;
  const status = document.createElement("div");
  status.id = "holocron-gac-collector-status";
  status.style.cssText = "position:fixed;z-index:2147483647;right:18px;bottom:18px;max-width:420px;padding:16px 20px;background:#10141d;color:#fff;border:1px solid #4d7fa8;border-radius:12px;font:14px/1.5 system-ui;box-shadow:0 8px 32px #0008";
  status.textContent = "Holocron : collecte GAC démarrée…";
  document.body.appendChild(status);
  const update = label => { done++; status.textContent = "Holocron : " + label + " (" + done + "/" + total + ")"; };
  try {
    for (const fmt of FORMATS) for (const side of SIDES) for (const league of LEAGUES) {
      const existing = views.find(view => view.format === fmt && view.side === side && view.league === league && viewIsValid(view));
      if (existing) {
        update(fmt + " · " + side + " · " + league + " : " + existing.rows.length + " personnages (repris)");
        continue;
      }
      const params = new URLSearchParams({ fmt, side, league });
      const url = BASE + "/tier-list/units/?" + params.toString();
      const html = await fetchPage(url);
      const view = parseUnitView(html, url, fmt, side, league);
      if (view.rows.length < 8) throw new Error("Seulement " + view.rows.length + " personnages détectés dans " + fmt + "/" + side + "/" + league + ". Export annulé.");
      const index = views.findIndex(item => item.format === fmt && item.side === side && item.league === league);
      if (index >= 0) views.splice(index, 1, view); else views.push(view);
      saveCheckpoint();
      update(fmt + " · " + side + " · " + league + " : " + view.rows.length + " personnages");
      await sleep(500);
    }
    for (const side of SIDES) for (const league of LEAGUES) {
      const existing = fleetViews.find(view => view.side === side && view.league === league && fleetViewIsValid(view));
      if (existing) {
        update("Flottes · " + side + " · " + league + " : " + existing.fleets.length + " compositions (reprises)");
        continue;
      }
      const params = new URLSearchParams({ side, league });
      const url = BASE + "/tier-list/fleet/?" + params.toString();
      const html = await fetchPage(url);
      const view = parseFleetView(html, url, side, league);
      const index = fleetViews.findIndex(item => item.side === side && item.league === league);
      if (index >= 0) fleetViews.splice(index, 1, view); else fleetViews.push(view);
      saveCheckpoint();
      update("Flottes · " + side + " · " + league + " : " + view.fleets.length + " compositions");
      await sleep(500);
    }
    const seasons = {};
    for (const view of views) seasons[view.format] = Math.max(seasons[view.format] || 0, view.season);
    for (const view of fleetViews) seasons.fleet = Math.max(seasons.fleet || 0, view.season);
    const output = {
      schemaVersion: 1,
      source: "SWGOH.GG browser session",
      collectedAt: new Date().toISOString(),
      seasons,
      views,
      fleetViews,
      notes: [
        "Only positively observed character rows and fleet compositions are included.",
        "Missing units or ships are unknown, never zero.",
        "Fleet counts represent observed ships in published top fleet compositions, not a complete ship census."
      ]
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "gac-browser-export.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    try { sessionStorage.removeItem(CACHE_KEY); } catch (_) {}
    status.textContent = "Collecte terminée : " + views.length + " vues personnages et " + fleetViews.length + " vues flottes. Fichier gac-browser-export.json téléchargé.";
    status.style.borderColor = "#4f9b73";
    setTimeout(() => status.remove(), 12000);
  } catch (error) {
    status.textContent = "Collecte interrompue : " + (error && error.message ? error.message : String(error)) + ". Aucun export partiel n'a été téléchargé.";
    status.style.borderColor = "#bd5c5c";
  }
})();