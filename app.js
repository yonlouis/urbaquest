"use strict";

/*
  ✅ UrbaQuest - app.js
  
  IMPORTANT:
  - Colle ici tout le contenu JavaScript de ton index.html (le gros <script>),
    puis applique les petites modifs Android/PWA ci-dessous.
  - Je t'ai laissé les helpers prêts à l'emploi (timeout fetch, wake lock, saveStateDebounced, visibilitychange).
*/

// -------------------------
// Helpers Android/PWA
// -------------------------

async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {});
  } catch (_) {}
}
async function releaseWakeLock() {
  try { if (wakeLock) await wakeLock.release(); } catch (_) {}
  wakeLock = null;
}

let _saveStateTimer = null;
function saveStateDebounced(saveStateFn) {
  if (_saveStateTimer) return;
  _saveStateTimer = setTimeout(() => {
    _saveStateTimer = null;
    try { saveStateFn(); } catch (_) {}
  }, 800);
}

document.addEventListener('visibilitychange', () => {
  // Ces fonctions (stopWatchPosition/startWatchPosition) existent dans ton code original.
  try {
    if (document.hidden) {
      if (typeof stopWatchPosition === 'function') stopWatchPosition();
      releaseWakeLock();
    } else {
      // Reprendre uniquement si on est dans une vue “jeu” (variable currentView dans ton code)
      if (typeof currentView !== 'undefined' && ['game','lobby','gallery'].includes(currentView)) {
        if (typeof startWatchPosition === 'function') startWatchPosition();
        requestWakeLock();
      }
    }
  } catch (_) {}
});

// -------------------------
// ⬇️ Colle TON code original ici
// -------------------------

/*
  1) Colle tout ton JS original ici.yyy
  2) Remplacements à faire dans ton code:
     - remplace fetch(...) par fetchWithTimeout(...) dans Overpass et Nominatim
     - dans watchPosition, remplace saveState() par saveStateDebounced(saveState)
     - dans enterRoom(): après startWatchPosition(); ajoute requestWakeLock();
     - dans leaveRoom(): avant showMenu(); ajoute releaseWakeLock();
*/
/* ============================================================
   FIREBASE INIT
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyADOzmRY7ZJJlLJ5KMWuJsV8gHT_bZeOMw",
  authDomain: "urbaquest.firebaseapp.com",
  databaseURL: "https://urbaquest-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "urbaquest",
  storageBucket: "urbaquest.firebasestorage.app",
  messagingSenderId: "233524460859",
  appId: "1:233524460859:web:88716a619ee299bd620b1e"
};

let firebaseReady = false;
let db = null, storage = null;

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  storage = firebase.storage();
  firebaseReady = true;
  db.ref('.info/connected').on('value', s => {
    setSyncDot(s.val() === true);
  });
} catch (e) {
  console.error("Firebase init failed:", e);
}

/* ============================================================
   UTILS
   ============================================================ */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function el(tag, props, ...children) {
  const e = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === 'class') e.className = props[k];
      else if (k === 'style' && typeof props[k] === 'object') Object.assign(e.style, props[k]);
      else if (k.startsWith('on') && typeof props[k] === 'function') {
        e.addEventListener(k.slice(2).toLowerCase(), props[k]);
      } else if (k === 'html') e.innerHTML = props[k];
      else if (k in e) {
        try { e[k] = props[k]; } catch (_) { e.setAttribute(k, props[k]); }
      } else e.setAttribute(k, props[k]);
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) c.forEach(cc => cc && e.appendChild(typeof cc === 'string' ? document.createTextNode(cc) : cc));
    else if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function genCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getBearing(from, to) {
  const dLng = (to.lng - from.lng) * Math.PI / 180;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function fmtTime(d) {
  d = d || new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

function distanceColor(d) {
  if (d < 100) return '#22C55E';
  if (d < 200) return '#EAB308';
  if (d < 300) return '#F97316';
  if (d < 400) return '#EF4444';
  return '#8B5CF6';
}

function fmtDistance(d) {
  if (d < 1000) return Math.round(d) + ' m';
  return (d / 1000).toFixed(1) + ' km';
}

function pointsForDistance(d) {
  if (d > 700) return null;
  if (d <= 100) return 0.5;
  if (d <= 150) return 1;
  if (d <= 200) return 1.5;
  if (d <= 250) return 2;
  if (d <= 300) return 2.5;
  if (d <= 350) return 3;
  if (d <= 400) return 3.5;
  if (d <= 450) return 4;
  if (d <= 500) return 4.5;
  if (d <= 600) return 5;
  return 5.5;
}

function showToast(msg, type) {
  const t = el('div', { class: 'toast ' + (type || '') }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showModal(content, opts) {
  opts = opts || {};
  const bg = el('div', { class: 'modal-bg', onclick: e => {
    if (e.target === bg && !opts.locked) bg.remove();
  }});
  const m = el('div', { class: 'modal' }, content);
  bg.appendChild(m);
  document.body.appendChild(bg);
  return bg;
}

function confirmDialog(title, msg, onYes) {
  const m = showModal([
    el('h2', null, title),
    el('p', { class: 'muted mb-14' }, msg),
    el('div', { class: 'row gap-8' },
      el('button', { class: 'flex1 ghost', onclick: () => m.remove() }, 'Annuler'),
      el('button', { class: 'flex1 primary', onclick: () => { m.remove(); onYes(); } }, 'Confirmer')
    )
  ], { locked: true });
}

function setSyncDot(on) {
  const d = $('#sync-dot');
  if (d) d.className = on ? 'sync-dot' : 'sync-dot off';
}

/* ============================================================
   PROFILE & STATE
   ============================================================ */
const STORAGE_KEY = 'urbaquest_profile_v1';
const STATE_KEY   = 'urbaquest_state_v1';

let profile = loadProfile();
let appState = loadState();

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (p && p.uid) return p;
  } catch (_) {}
  return null;
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  if (firebaseReady && profile && profile.uid) {
    const safe = { ...profile };
    db.ref('players/' + profile.uid).set(safe).catch(()=>{});
  }
}

function newProfile(pseudo, avatar) {
  return {
    uid: uuid(),
    pseudo: pseudo,
    avatar: avatar || null,
    scores: { solo: 0, competitive: 0, group: 0, total: 0 },
    glicko: { rating: 1500, rd: 350, vol: 0.06 },
    level: 1, xp: 0,
    streak: { current: 0, best: 0, lastPlay: null },
    stats: { cities: [], countries: [], continents: [], firstFlashes: 0, perfectRuns: 0, perfectDays: 0 },
    badges: [],
    title: "PASSANT",
    titleEmoji: "🚶",
    friends: [],
    createdAt: Date.now()
  };
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (s) return s;
  } catch (_) {}
  return { currentRoom: null, sessionStart: null, sessionDistance: 0, lastGPS: null, gpsTrack: [] };
}
function saveState() { localStorage.setItem(STATE_KEY, JSON.stringify(appState)); }

/* ============================================================
   SCORING
   ============================================================ */
function calcRarity(validations) {
  const v = (validations || 0) + 1;
  let IR = 1 / Math.log10(v + 1) * 4;
  if (IR > 4) IR = 4;
  if (IR < 1) IR = 1;
  return parseFloat(IR.toFixed(2));
}
function rarityLabel(IR) {
  if (IR >= 3.5) return 'Vierge';
  if (IR >= 2.5) return 'Rare';
  if (IR >= 1.7) return 'Connu';
  return 'Commun';
}

function calcScore(place, session, mode, result) {
  const base = place.pts;
  const IR = calcRarity(place.validations || 0);
  const km = (session.distanceWalked || 0) / 1000;
  let endurance = 1.0;
  if (km >= 5) endurance = 1.75;
  else if (km >= 3) endurance = 1.5;
  else if (km >= 2) endurance = 1.35;
  else if (km >= 1) endurance = 1.2;
  else if (km >= 0.5) endurance = 1.1;
  if (session.suspectSpeed) endurance = 1.0;

  const cdcMap = { 500: 1.0, 700: 1.3, 1000: 1.6, 1500: 2.0, city: 3.0 };
  const CDC = cdcMap[session.radius] || 1.0;
  const raw = base * IR * endurance * CDC;
  const multiplier = mode === 'solo' ? 1.0
    : (mode === 'competitive' && result === 'win') ? 1.5
    : (mode === 'competitive' && result === 'loss') ? 0.8
    : 1.0;

  return {
    total: parseFloat((raw * multiplier).toFixed(1)),
    base: base, IR: IR, endurance: endurance, CDC: CDC, multiplier: multiplier
  };
}

function coverageBonus(pct) {
  if (pct >= 0.9) return 2.5;
  if (pct >= 0.75) return 1.8;
  if (pct >= 0.6) return 1.5;
  if (pct >= 0.4) return 1.2;
  return 1.0;
}

function calcSPG(stats) {
  return (stats.cities.length * 50) + (stats.countries.length * 200) + (stats.continents.length * 500);
}

function xpForLevel(lv) {
  // Curve: rapid early, slower later
  return Math.floor(50 * Math.pow(lv, 1.55));
}
function levelFromXP(xp) {
  let lv = 1;
  while (xpForLevel(lv + 1) <= xp && lv < 100) lv++;
  return lv;
}
const TITLES = [
  { lv: 1,   emoji: '🚶', name: 'PASSANT' },
  { lv: 5,   emoji: '👀', name: 'CURIEUX' },
  { lv: 10,  emoji: '🗺️', name: 'FLÂNEUR' },
  { lv: 20,  emoji: '🔦', name: 'RÔDEUR' },
  { lv: 30,  emoji: '🧭', name: 'CARTOGRAPHE' },
  { lv: 40,  emoji: '🐈', name: 'CHAT SAUVAGE' },
  { lv: 50,  emoji: '👤', name: 'INFILTRATEUR' },
  { lv: 60,  emoji: '🌫️', name: 'FANTÔME' },
  { lv: 70,  emoji: '⚡', name: 'ÉLECTRON LIBRE' },
  { lv: 80,  emoji: '🏴', name: 'HORS-LA-LOI' },
  { lv: 90,  emoji: '🌐', name: 'NOMADE ABSOLU' },
  { lv: 100, emoji: '👑', name: 'ARCHITECTE' }
];

function rankFromRating(r) {
  if (r >= 5000) return { name: 'LÉGENDE URBAINE', emoji: '👑', color: 'gold' };
  if (r >= 4000) return { name: 'INFILTRATEUR', emoji: '🏆', color: '#a855f7' };
  if (r >= 3000) return { name: 'ÉCLAIREUR', emoji: '💎', color: '#06b6d4' };
  if (r >= 2000) return { name: 'CHASSEUR', emoji: '🥇', color: '#f59e0b' };
  if (r >= 1000) return { name: 'TRAQUEUR', emoji: '🥈', color: '#9ca3af' };
  let div = 'I';
  if (r >= 750) div = 'IV';
  else if (r >= 500) div = 'III';
  else if (r >= 250) div = 'II';
  return { name: 'EXPLORATEUR ' + div, emoji: '🥉', color: '#cd7f32' };
}

/* ============================================================
   GLICKO-2 (simplified)
   ============================================================ */
const GLICKO_TAU = 0.5;
const SCALE = 173.7178;

function g(phi) { return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI)); }
function E(mu, muj, phij) { return 1 / (1 + Math.exp(-g(phij) * (mu - muj))); }

function updateGlicko(player, results) {
  // results: array of { rating, rd, score: 0|0.5|1 }
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  if (results.length === 0) {
    const newPhi = Math.sqrt(phi * phi + player.vol * player.vol);
    return { rating: player.rating, rd: Math.min(newPhi * SCALE, 350), vol: player.vol };
  }
  let v_inv = 0;
  let delta_sum = 0;
  for (const r of results) {
    const muj = (r.rating - 1500) / SCALE;
    const phij = r.rd / SCALE;
    const e = E(mu, muj, phij);
    const gj = g(phij);
    v_inv += gj * gj * e * (1 - e);
    delta_sum += gj * (r.score - e);
  }
  const v = 1 / v_inv;
  const delta = v * delta_sum;
  const a = Math.log(player.vol * player.vol);
  const f = (x) => {
    const ex = Math.exp(x);
    const d2 = delta * delta;
    const p2 = phi * phi;
    return (ex * (d2 - p2 - v - ex)) / (2 * (p2 + v + ex) * (p2 + v + ex)) - (x - a) / (GLICKO_TAU * GLICKO_TAU);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * GLICKO_TAU) < 0 && k < 50) k++;
    B = a - k * GLICKO_TAU;
  }
  let fA = f(A), fB = f(B);
  let it = 0;
  while (Math.abs(B - A) > 0.000001 && it < 50) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; }
    else fA = fA / 2;
    B = C; fB = fC;
    it++;
  }
  const newVol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newVol * newVol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * delta_sum;
  let newRating = newMu * SCALE + 1500;
  let newRD = Math.min(newPhi * SCALE, 350);
  // Floor at 1000 for protected EXPLORATEUR
  if (player.rating < 1000 && newRating < player.rating) newRating = player.rating;
  return {
    rating: parseFloat(newRating.toFixed(1)),
    rd: parseFloat(newRD.toFixed(1)),
    vol: parseFloat(newVol.toFixed(5))
  };
}

/* ============================================================
   PLACES — OVERPASS / CATALOG
   ============================================================ */
const EXCLUDED_TERMS = /(distributeur|atm|parking|toilette|wc|kebab|mcdonald|burger king|kfc|subway|quick|carrefour|monoprix|franprix)/i;

function categoryFromTags(t) {
  if (t.historic) return { emoji: '🏛️', name: 'historique' };
  if (t.tourism === 'museum') return { emoji: '🖼️', name: 'musée' };
  if (t.tourism === 'artwork' || t.artwork_type) return { emoji: '🎨', name: 'œuvre' };
  if (t.tourism === 'viewpoint') return { emoji: '🔭', name: 'point de vue' };
  if (t.amenity === 'fountain') return { emoji: '⛲', name: 'fontaine' };
  if (t.tourism === 'attraction') return { emoji: '⭐', name: 'attraction' };
  if (t.tourism) return { emoji: '📍', name: t.tourism };
  return { emoji: '📍', name: 'lieu' };
}

async function fetchOverpass(lat, lng, radius) {
  const query = `
[out:json][timeout:25];
(
  node["name"]["historic"](around:${radius},${lat},${lng});
  node["name"]["tourism"](around:${radius},${lat},${lng});
  node["name"]["amenity"="fountain"](around:${radius},${lat},${lng});
  node["name"]["artwork_type"](around:${radius},${lat},${lng});
  way["name"]["historic"](around:${radius},${lat},${lng});
  way["name"]["tourism"](around:${radius},${lat},${lng});
);
out center 40;`;
  const url = 'https://overpass-api.de/api/interpreter';
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  });
  if (!resp.ok) throw new Error('Overpass HTTP ' + resp.status);
  const data = await resp.json();
  const out = [];
  for (const elt of (data.elements || [])) {
    const tags = elt.tags || {};
    const name = tags.name;
    if (!name) continue;
    if (EXCLUDED_TERMS.test(name)) continue;
    const lat2 = elt.lat || (elt.center && elt.center.lat);
    const lng2 = elt.lon || (elt.center && elt.center.lon);
    if (!lat2 || !lng2) continue;
    const dist = haversine(lat, lng, lat2, lng2);
    if (dist > radius) continue;
    const cat = categoryFromTags(tags);
    const pts = pointsForDistance(dist);
    if (pts == null) continue;
    out.push({
      id: 'osm_' + (elt.type || 'n') + '_' + elt.id,
      name: name,
      lat: lat2, lng: lng2,
      distance: Math.round(dist),
      cat: cat.name, catEmoji: cat.emoji,
      pts: pts,
      certified: false,
      validations: 0,
      status: 'new'
    });
  }
  return out;
}

async function loadCatalogPlaces(lat, lng, radius) {
  if (!firebaseReady) return [];
  try {
    const snap = await db.ref('catalog').once('value');
    const data = snap.val() || {};
    const out = [];
    for (const slug in data) {
      const places = (data[slug] && data[slug].places) || {};
      for (const id in places) {
        const p = places[id];
        if (!p.lat || !p.lng) continue;
        const d = haversine(lat, lng, p.lat, p.lng);
        if (d <= radius) {
          const pts = pointsForDistance(d);
          if (pts == null) continue;
          out.push({
            id: id,
            name: p.name,
            lat: p.lat, lng: p.lng,
            distance: Math.round(d),
            cat: p.cat || 'lieu', catEmoji: p.catEmoji || '🏅',
            pts: p.pts || pts,
            certified: true,
            validations: p.validations || 0,
            status: 'certified',
            description: p.description || ''
          });
        }
      }
    }
    return out;
  } catch (e) { return []; }
}

async function loadCommunityPlaces(lat, lng, radius) {
  if (!firebaseReady) return [];
  try {
    const snap = await db.ref('places').once('value');
    const data = snap.val() || {};
    const out = [];
    for (const id in data) {
      const p = data[id];
      if (!p.lat || !p.lng) continue;
      const d = haversine(lat, lng, p.lat, p.lng);
      if (d <= radius) {
        const pts = pointsForDistance(d);
        if (pts == null) continue;
        out.push({
          id: id, name: p.name, lat: p.lat, lng: p.lng,
          distance: Math.round(d),
          cat: p.cat || 'lieu', catEmoji: p.catEmoji || '📍',
          pts: pts,
          certified: false,
          validations: p.validations || 0,
          status: p.status || 'new'
        });
      }
    }
    return out;
  } catch (e) { return []; }
}

async function gatherPlaces(lat, lng, radius, cityMode) {
  const catalog = await loadCatalogPlaces(lat, lng, cityMode ? 50000 : radius);
  if (cityMode) {
    return catalog.slice(0, 60);
  }
  // dedup against catalog
  const seen = new Set(catalog.map(p => p.id));
  const community = await loadCommunityPlaces(lat, lng, radius);
  const filteredCommunity = community.filter(p => !seen.has(p.id));
  let osm = [];
  try { osm = await fetchOverpass(lat, lng, radius); } catch (e) { console.warn(e); }
  const seen2 = new Set(catalog.map(p => p.id).concat(filteredCommunity.map(p => p.id)));
  const filteredOsm = osm.filter(p => !seen2.has(p.id));
  return catalog.concat(filteredCommunity).concat(filteredOsm).sort((a, b) => a.distance - b.distance);
}

/* ============================================================
   FAIR-PLAY ASSIGNMENT
   ============================================================ */
function assignPlaces(places, target, nbPlayers) {
  const used = new Set();
  function fillPlayer(t) {
    const arr = [];
    let score = 0;
    const veryLow = places.filter(p => p.pts >= 0.5 && p.pts <= 1 && !used.has(p.id));
    if (veryLow.length && t >= veryLow[0].pts) {
      const p = veryLow[Math.floor(Math.random() * veryLow.length)];
      arr.push(p.id); used.add(p.id); score += p.pts;
    }
    const medLow = places.filter(p => p.pts >= 1.5 && p.pts <= 2 && !used.has(p.id));
    if (medLow.length && t - score >= medLow[0].pts) {
      const p = medLow[Math.floor(Math.random() * medLow.length)];
      arr.push(p.id); used.add(p.id); score += p.pts;
    }
    const byPts = {};
    places.forEach(p => { if (!byPts[p.pts]) byPts[p.pts] = []; byPts[p.pts].push(p); });
    const keys = Object.keys(byPts).map(Number).sort((a, b) => b - a);
    let rem = parseFloat((t - score).toFixed(1));
    let safety = 0;
    outer: for (const k of keys) {
      while (rem >= k) {
        if (++safety > 200) break outer;
        const c = (byPts[k] || []).filter(p => !used.has(p.id));
        if (!c.length) break;
        const p = c[Math.floor(Math.random() * c.length)];
        arr.push(p.id); used.add(p.id);
        score = parseFloat((score + k).toFixed(1));
        rem = parseFloat((t - score).toFixed(1));
      }
    }
    return arr;
  }
  const result = {};
  for (let i = 0; i < nbPlayers; i++) result['p' + i] = fillPlayer(target);
  return result;
}

/* ============================================================
   GEOLOCATION
   ============================================================ */
let watchId = null;
let currentHeading = 0;

function getOnePosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Géolocalisation indisponible'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  });
}

function startWatchPosition(onUpdate) {
  if (!navigator.geolocation) return;
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(
    pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, t: Date.now() };
      // Track distance
      if (appState.lastGPS) {
        const d = haversine(appState.lastGPS.lat, appState.lastGPS.lng, p.lat, p.lng);
        const dt = (p.t - appState.lastGPS.t) / 1000;
        const speed = d / Math.max(dt, 0.001);
        if (speed < 4.5 && d < 100) {
          appState.sessionDistance = (appState.sessionDistance || 0) + d;
        }
      }
      appState.lastGPS = p;
      saveStateDebounced(saveState);
      if (onUpdate) onUpdate(p);
    },
    err => console.warn('watch err', err),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
  );
}

function stopWatchPosition() {
  if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

async function setupOrientation(callback) {
  function handler(e) {
    let hdg = e.webkitCompassHeading != null ? e.webkitCompassHeading
      : (e.alpha != null ? (360 - e.alpha) : 0);
    currentHeading = hdg;
    if (callback) callback(hdg);
  }
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r === 'granted') window.addEventListener('deviceorientation', handler);
    } catch (e) { console.warn('orientation perm denied', e); }
  } else {
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
  }
}

/* ============================================================
   CITY/COUNTRY (reverse geocoding via Nominatim — best effort)
   ============================================================ */
async function reverseGeo(lat, lng) {
  try {
    const r = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`, {
      headers: { 'Accept-Language': 'fr' }
    });
    if (!r.ok) return null;
    const j = await r.json();
    const addr = j.address || {};
    const continent = continentFromCountryCode(addr.country_code);
    return {
      city: addr.city || addr.town || addr.village || addr.municipality || null,
      country: addr.country || null,
      continent: continent
    };
  } catch (e) { return null; }
}
function continentFromCountryCode(cc) {
  if (!cc) return null;
  cc = cc.toLowerCase();
  const eu = ['fr','de','it','es','pt','be','nl','lu','ch','at','gb','ie','dk','se','no','fi','is','pl','cz','sk','hu','ro','bg','gr','si','hr','rs','ba','me','mk','al','ee','lv','lt','ua','by','md','tr','cy','mt','va','sm','mc','ad','li','xk'];
  const af = ['ma','dz','tn','ly','eg','sd','et','ke','ng','za','gh','ci','sn','cm','tz','ug','rw','zm','zw','ao','mz','mg','dj','so','er','cg','cd','ga','tg','bj','bf','ml','ne','td','cf','gq','sl','lr','gn','gw','gm','mr','sc','mu','km','st','cv','bw','na','ls','sz'];
  const as = ['cn','jp','kr','kp','vn','th','la','kh','mm','my','sg','id','ph','bn','tw','hk','mo','mn','in','pk','bd','lk','np','bt','mv','ir','iq','sa','ae','om','ye','sy','jo','lb','il','ps','kw','qa','bh','af','kz','uz','tm','tj','kg','az','am','ge'];
  const na = ['us','ca','mx','gt','bz','sv','hn','ni','cr','pa','cu','do','ht','jm','bs','bb','tt','gd','lc','vc','dm','ag','kn','pr'];
  const sa = ['br','ar','cl','co','pe','ve','ec','bo','py','uy','gy','sr','gf','fk'];
  const oc = ['au','nz','pg','fj','ws','to','sb','vu','ki','tv','nr','mh','fm','pw'];
  if (eu.includes(cc)) return 'Europe';
  if (af.includes(cc)) return 'Afrique';
  if (as.includes(cc)) return 'Asie';
  if (na.includes(cc)) return 'Amérique du Nord';
  if (sa.includes(cc)) return 'Amérique du Sud';
  if (oc.includes(cc)) return 'Océanie';
  return null;
}

/* ============================================================
   IMAGE COMPRESSION
   ============================================================ */
function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h && w > maxSize) { h = h * maxSize / w; w = maxSize; }
      else if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (blob) resolve(blob); else reject(new Error('compression failed'));
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   BADGE LOGIC
   ============================================================ */
const BADGES = {
  premier_pas: { name: 'Premier Pas', emoji: '👣', family: 'Exploration' },
  enfant_quartier: { name: 'Enfant du Quartier', emoji: '🏘️', family: 'Exploration' },
  citadin: { name: 'Citadin', emoji: '🏙️', family: 'Exploration' },
  voyageur: { name: 'Voyageur', emoji: '🎒', family: 'Exploration' },
  globe_trotter: { name: 'Globe-Trotter', emoji: '🌍', family: 'Exploration' },
  tous_continents: { name: 'Tous Continents', emoji: '🌐', family: 'Exploration', animated: true },
  iron_walker: { name: 'Iron Walker', emoji: '🦾', family: 'Performance' },
  sprinter: { name: 'Sprinter Urbain', emoji: '💨', family: 'Performance' },
  perfect_run: { name: 'Perfect Run', emoji: '🏆', family: 'Performance', animated: true },
  perfect_day: { name: 'Perfect Day', emoji: '☀️', family: 'Performance', animated: true },
  first_flash: { name: 'First Flash', emoji: '⚡', family: 'Performance' },
  triple_flash: { name: 'Triple First Flash', emoji: '✨', family: 'Performance', animated: true },
  premiere_victoire: { name: 'Première Victoire', emoji: '🥇', family: 'Compétition' },
  sans_pitie: { name: 'Sans Pitié', emoji: '⚔️', family: 'Compétition' },
  renversement: { name: 'Renversement', emoji: '🔄', family: 'Compétition' },
  intraitable: { name: 'Intraitable', emoji: '🛡️', family: 'Compétition' },
  legende_comp: { name: 'Légende Compétitive', emoji: '👑', family: 'Compétition', animated: true },
  premiere_semaine: { name: 'Première Semaine', emoji: '🔥', family: 'Régularité' },
  mois_complet: { name: 'Mois Complet', emoji: '📅', family: 'Régularité' },
  cent_jours: { name: 'Cent Jours', emoji: '💯', family: 'Régularité', animated: true },
  annee: { name: 'Année Urbaine', emoji: '🎂', family: 'Régularité', animated: true },
  survivant: { name: 'Survivant', emoji: '🌅', family: 'Régularité' },
  recruteur: { name: 'Recruteur', emoji: '🤝', family: 'Communauté' },
  arbitre: { name: 'Arbitre', emoji: '⚖️', family: 'Communauté' },
  curateur: { name: 'Curateur', emoji: '🎨', family: 'Communauté' },
  equipier_parfait: { name: 'Équipier Parfait', emoji: '🤜', family: 'Communauté' },
  ambassadeur: { name: 'Ambassadeur', emoji: '🌟', family: 'Communauté' },
  noctambule: { name: 'Noctambule', emoji: '🌙', family: 'Secrets', secret: true },
  mauvais_temps: { name: 'Mauvais Temps', emoji: '🌧️', family: 'Secrets', secret: true },
  anniversaire: { name: 'Anniversaire', emoji: '🎉', family: 'Secrets', secret: true },
  gemeaux: { name: 'Gémeaux Urbains', emoji: '👯', family: 'Secrets', secret: true }
};

function awardBadge(id) {
  if (!profile.badges.includes(id)) {
    profile.badges.push(id);
    showToast('🎖️ Badge débloqué : ' + BADGES[id].name, 'green');
    saveProfile();
  }
}

function checkBadgesAfterValidation(place, geoInfo, isFirstFlash, hourLocal) {
  if (profile.badges.length === 0 || !profile.badges.includes('premier_pas')) {
    awardBadge('premier_pas');
  }
  if (geoInfo && geoInfo.city && profile.stats.cities.includes(geoInfo.city)) {
    const sameCount = (profile.placesByCity || {})[geoInfo.city] || 0;
    if (sameCount >= 10) awardBadge('enfant_quartier');
    if (sameCount >= 50) awardBadge('citadin');
  }
  if (profile.stats.cities.length >= 3) awardBadge('voyageur');
  if (profile.stats.countries.length >= 5) awardBadge('globe_trotter');
  if (profile.stats.continents.length >= 4) awardBadge('tous_continents');
  if (isFirstFlash) {
    profile.stats.firstFlashes = (profile.stats.firstFlashes || 0) + 1;
    awardBadge('first_flash');
  }
  if (hourLocal >= 2 && hourLocal < 4) awardBadge('noctambule');
  // Birthday check
  if (profile.birthday) {
    const t = new Date();
    if (profile.birthday === (t.getMonth()+1) + '-' + t.getDate()) awardBadge('anniversaire');
  }
  saveProfile();
}

/* ============================================================
   UI / ROUTING
   ============================================================ */
let currentRoom = null;
let roomListener = null;

function render(view) {
  const root = $('#app');
  root.innerHTML = '';
  const hdr = el('div', { class: 'header' },
    el('div', { class: 'logo' }, 'Urba', el('span', { class: 'u-q' }, 'Quest')),
    el('div', { class: 'row gap-8' },
      profile && profile.streak.current > 0
        ? el('div', { class: 'streak-pill' }, '🔥 ' + profile.streak.current + 'j')
        : null,
      el('div', { id: 'sync-dot', class: firebaseReady ? 'sync-dot' : 'sync-dot off' })
    )
  );
  root.appendChild(hdr);
  const screen = el('div', { class: 'screen' });
  root.appendChild(screen);
  view(screen);
  // Bottom nav (when not in onboarding/game/compass)
  if (currentView && ['menu','rankings','profile'].includes(currentView)) {
    root.appendChild(buildBottomNav());
  }
}

let currentView = null;

function buildBottomNav() {
  const items = [
    { id: 'menu', ico: '🏠', label: 'Accueil', go: showMenu },
    { id: 'rankings', ico: '🏆', label: 'Classements', go: showRankings },
    { id: 'profile', ico: '👤', label: 'Profil', go: showProfile }
  ];
  return el('div', { class: 'bottom-nav' },
    items.map(it =>
      el('div', { class: 'nav-item' + (currentView === it.id ? ' active' : ''), onclick: it.go },
        el('div', { class: 'ico' }, it.ico),
        el('div', null, it.label)
      )
    )
  );
}

/* ============================================================
   ONBOARDING
   ============================================================ */
function showOnboarding() {
  currentView = 'onboarding';
  render(screen => {
    let avatarData = null;
    const fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    const avatarBox = el('div', { class: 'avatar lg', onclick: () => fileInput.click() }, '📷');
    fileInput.addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const blob = await compressImage(f, 256, 0.85);
        const reader = new FileReader();
        reader.onload = ev => {
          avatarData = ev.target.result;
          avatarBox.innerHTML = '';
          avatarBox.appendChild(el('img', { src: avatarData, alt: '' }));
        };
        reader.readAsDataURL(blob);
      } catch (e) { showToast('Erreur image', 'red'); }
    });
    const pseudoIn = el('input', { placeholder: 'Ton prénom ou pseudo', maxlength: 24 });
    screen.append(
      el('h1', null, 'Bienvenue sur ', el('span', { style: { color: 'var(--green)' } }, 'UrbaQuest')),
      el('p', { class: 'muted mb-18' }, "Crée ton profil pour explorer ta ville et défier d'autres joueurs."),
      el('div', { class: 'card mb-14' },
        el('div', { class: 'col gap-16' },
          el('div', { class: 'row gap-12' },
            avatarBox,
            el('div', { class: 'flex1' },
              el('div', { class: 'small muted mb-6' }, 'Photo (facultatif)'),
              el('button', { class: 'ghost small', onclick: () => fileInput.click() }, 'Choisir une image'),
              fileInput
            )
          ),
          el('div', null,
            el('div', { class: 'small muted mb-6' }, 'Pseudo'),
            pseudoIn
          )
        )
      ),
      el('button', { class: 'primary full', onclick: () => {
        const ps = pseudoIn.value.trim();
        if (ps.length < 2) return showToast('Pseudo trop court', 'red');
        profile = newProfile(ps, avatarData);
        saveProfile();
        showMenu();
      }}, 'Commencer')
    );
  });
}

/* ============================================================
   MAIN MENU
   ============================================================ */
function showMenu() {
  currentView = 'menu';
  render(screen => {
    screen.append(
      el('h1', null, 'Salut ', el('span', { style: { color: 'var(--green)' } }, profile.pseudo), ' 👋'),
      el('p', { class: 'muted mb-18' }, 'Choisis un mode de jeu pour commencer.'),
      el('div', { class: 'col gap-12' },
        modeCard('🎯', 'Solo', 'Explore librement, score cumulatif', 'card-green', () => createSession('solo')),
        modeCard('⚔️', 'Compétitif', '1vN — duel ou multi, rang Glicko-2', 'card-blue', () => createOrJoin('competitive')),
        modeCard('👥', "Groupe', '2 à 6 alliés, score d'équipe", 'card-purple', () => createOrJoin('group')),
        modeCard('🏆', 'Classements', 'Compétitif, global & amis', 'card-amber', showRankings)
      ),
      el('div', { class: 'mt-24 muted small center' },
        'v1.0 · ', el('a', { href: '#', onclick: e => { e.preventDefault(); showProfile(); }, style: { color: 'var(--green)' } }, 'Mon profil')
      )
    );
  });
}

function modeCard(emoji, title, sub, cls, onClick) {
  return el('div', { class: 'card tappable ' + cls, onclick: onClick },
    el('div', { class: 'row gap-12' },
      el('div', { style: { fontSize: '36px' } }, emoji),
      el('div', { class: 'flex1' },
        el('div', { style: { fontSize: '18px', fontWeight: '700' } }, title),
        el('div', { class: 'muted small' }, sub)
      ),
      el('div', { class: 'muted', style: { fontSize: '20px' } }, '›')
    )
  );
}

/* ============================================================
   CREATE / JOIN ROUTE
   ============================================================ */
function createOrJoin(mode) {
  showModal([
    el('h2', null, mode === 'competitive' ? 'Compétitif' : 'Groupe'),
    el('p', { class: 'muted mb-14' }, 'Créer une nouvelle partie ou rejoindre un code existant.'),
    el('div', { class: 'col gap-10' },
      el('button', { class: 'primary full', onclick: () => { closeModals(); createSession(mode); } }, '➕ Créer une partie'),
      el('button', { class: 'full', onclick: () => { closeModals(); joinByCode(mode); } }, '🔑 Rejoindre par code')
    )
  ]);
}

function closeModals() { $$('.modal-bg').forEach(m => m.remove()); }

function joinByCode(mode) {
  const codeIn = el('input', { class: 'input-otp', placeholder: '••••••', maxlength: 6 });
  showModal([
    el('h2', null, 'Rejoindre une partie'),
    el('p', { class: 'muted mb-14' }, "Saisis le code à 6 caractères donné par l'hôte."),
    codeIn,
    el('div', { class: 'mt-14 row gap-8' },
      el('button', { class: 'flex1 ghost', onclick: closeModals }, 'Annuler'),
      el('button', { class: 'flex1 primary', onclick: async () => {
        const code = codeIn.value.trim().toUpperCase();
        if (code.length !== 6) return showToast('Code invalide', 'red');
        await tryJoinRoom(code);
      }}, 'Rejoindre')
    )
  ]);
}

async function tryJoinRoom(code) {
  if (!firebaseReady) return showToast('Firebase indisponible', 'red');
  try {
    const snap = await db.ref('rooms/' + code).once('value');
    const room = snap.val();
    if (!room) return showToast('Partie introuvable', 'red');
    if (room.status === 'finished') return showToast('Partie terminée', 'red');
    // Add player
    const playerEntry = {
      pseudo: profile.pseudo,
      avatar: profile.avatar || null,
      rating: profile.glicko.rating,
      rank: rankFromRating(profile.glicko.rating).name
    };
    await db.ref(`rooms/${code}/players/${profile.uid}`).set(playerEntry);
    await db.ref(`rooms/${code}/scores/${profile.uid}`).set(0);
    closeModals();
    enterRoom(code);
  } catch (e) {
    console.error(e);
    showToast('Erreur réseau', 'red');
  }
}

/* ============================================================
   CREATE SESSION FLOW
   ============================================================ */
async function createSession(mode) {
  currentView = 'create';
  render(screen => {
    let teamName = '';
    let target = 20;
    let maxOpponents = 1;
    let radius = 500;
    screen.append(el('h1', null, mode === 'solo' ? '🎯 Solo' : mode === 'competitive' ? '⚔️ Compétitif' : '👥 Groupe'));
    screen.append(el('p', { class: 'muted mb-18' }, 'Configure les paramètres de ta partie.'));

    const radiusSel = el('select', null,
      el('option', { value: '500' }, '500 m  ·  CDC ×1.0  ·  6+ lieux'),
      el('option', { value: '700' }, '700 m  ·  CDC ×1.3  ·  8+ lieux'),
      el('option', { value: '1000' }, '1000 m ·  CDC ×1.6  ·  10+ lieux'),
      el('option', { value: '1500' }, '1500 m ·  CDC ×2.0  ·  12+ lieux'),
      el('option', { value: 'city' }, '🌆 Ville entière · CDC ×3.0 · catalogue')
    );

    const targetIn = el('input', { type: 'number', value: 20, min: 5, max: 200 });
    const opponentsSel = el('select', null,
      el('option', { value: 1 }, '1 adversaire'),
      el('option', { value: 2 }, '2 adversaires'),
      el('option', { value: 3 }, '3 adversaires'),
      el('option', { value: 4 }, '4 adversaires'),
      el('option', { value: 5 }, '5 adversaires')
    );
    const teamIn = el('input', { placeholder: "Nom de l'équipe", maxlength: 24 });

    const card = el('div', { class: 'card col gap-14' });
    card.append(
      el('div', null, el('div', { class: 'small muted mb-6' }, "Rayon d'exploration"), radiusSel),
      el('div', null, el('div', { class: 'small muted mb-6' }, 'Objectif de points'), targetIn)
    );
    if (mode === 'competitive') card.append(
      el('div', null, el('div', { class: 'small muted mb-6' }, 'Adversaires'), opponentsSel)
    );
    if (mode === 'group') card.append(
      el('div', null, el('div', { class: 'small muted mb-6' }, "Nom de l'équipe"), teamIn)
    );

    screen.append(card);
    screen.append(
      el('div', { class: 'row gap-8 mt-18' },
        el('button', { class: 'flex1 ghost', onclick: showMenu }, 'Annuler'),
        el('button', { class: 'flex1 primary', onclick: async () => {
          radius = radiusSel.value === 'city' ? 'city' : parseInt(radiusSel.value, 10);
          target = parseInt(targetIn.value, 10) || 20;
          maxOpponents = parseInt(opponentsSel.value, 10) || 1;
          teamName = teamIn.value.trim() || 'Équipe';
          await launchSession(mode, radius, target, maxOpponents, teamName);
        }}, 'Lancer →')
      )
    );
  });
}

async function launchSession(mode, radius, target, maxOpponents, teamName) {
  showModal([
    el('h2', null, '📍 Géolocalisation'),
    el('p', { class: 'muted' }, 'Récupération de ta position et chargement des lieux...'),
    el('div', { class: 'spinner' })
  ]);

  let pos;
  try { pos = await getOnePosition(); }
  catch (e) {
    closeModals();
    return showToast('Géolocalisation refusée', 'red');
  }

  const cityMode = radius === 'city';
  const effectiveRadius = cityMode ? 50000 : radius;
  const minPlaces = { 500: 6, 700: 8, 1000: 10, 1500: 12, city: 20 }[radius] || 6;

  let places = [];
  try { places = await gatherPlaces(pos.lat, pos.lng, effectiveRadius, cityMode); }
  catch (e) { closeModals(); return showToast('Erreur de chargement des lieux', 'red'); }

  closeModals();

  if (places.length < minPlaces) {
    return offerExpand(mode, radius, target, maxOpponents, teamName, places.length, minPlaces);
  }

  // Reverse geo (best effort)
  let geo = null;
  try { geo = await reverseGeo(pos.lat, pos.lng); } catch (_) {}

  const code = genCode();
  const playersData = {};
  playersData[profile.uid] = {
    pseudo: profile.pseudo, avatar: profile.avatar || null,
    rating: profile.glicko.rating, rank: rankFromRating(profile.glicko.rating).name
  };

  const placesObj = {};
  for (const p of places) {
    placesObj[p.id] = {
      name: p.name, lat: p.lat, lng: p.lng, pts: p.pts,
      cat: p.cat, catEmoji: p.catEmoji,
      certified: !!p.certified, validations: p.validations || 0,
      status: p.status || 'new'
    };
  }

  const room = {
    mode: mode,
    radius: cityMode ? 'city' : radius,
    target: target,
    teamName: mode === 'group' ? teamName : null,
    hostUid: profile.uid,
    players: playersData,
    places: placesObj,
    visits: {},
    scores: { [profile.uid]: 0 },
    teamScore: 0,
    coverageBonus: 1.0,
    winner: null,
    status: 'waiting',
    resetDone: false,
    maxOpponents: mode === 'competitive' ? maxOpponents : null,
    startLat: pos.lat, startLng: pos.lng,
    city: geo ? geo.city : null,
    country: geo ? geo.country : null,
    continent: geo ? geo.continent : null,
    ts: Date.now()
  };

  // Solo: skip waiting room
  if (mode === 'solo') {
    room.status = 'playing';
    room.assigns = { [profile.uid]: Object.keys(placesObj) };
  } else if (mode === 'group') {
    room.assigns = null; // all visible
  }

  if (firebaseReady) {
    try { await db.ref('rooms/' + code).set(room); }
    catch (e) { return showToast('Erreur Firebase', 'red'); }
  }
  enterRoom(code);
}

function offerExpand(mode, radius, target, maxOpponents, teamName, found, needed) {
  const radii = [500, 700, 1000, 1500];
  const idx = radii.indexOf(radius);
  const next = idx >= 0 && idx < radii.length - 1 ? radii[idx + 1] : null;
  showModal([
    el('h2', null, 'Pas assez de lieux'),
    el('p', { class: 'muted mb-14' },
      `Trouvé ${found} lieux, il en faut ${needed} minimum dans le rayon choisi.`),
    next
      ? el('div', { class: 'col gap-8' },
          el('button', { class: 'primary full', onclick: () => {
            closeModals();
            launchSession(mode, next, target, maxOpponents, teamName);
          }}, `Élargir à ${next}m`),
          el('button', { class: 'ghost full', onclick: () => { closeModals(); showMenu(); } }, 'Annuler')
        )
      : el('div', null,
          el('p', { class: 'muted mb-14' }, 'Tu es déjà au rayon maximum (1500m). Essaie le mode Ville.'),
          el('button', { class: 'full', onclick: () => { closeModals(); showMenu(); } }, 'Retour')
        )
  ]);
}

/* ============================================================
   ENTER ROOM (game screen)
   ============================================================ */
let activeRoomCode = null;

function enterRoom(code) {
  activeRoomCode = code;
  appState.currentRoom = code;
  appState.sessionStart = Date.now();
  appState.sessionDistance = 0;
  appState.lastGPS = null;
  saveState();
  if (firebaseReady) {
    if (roomListener) roomListener.off();
    roomListener = db.ref('rooms/' + code);
    roomListener.on('value', snap => {
      const room = snap.val();
      if (!room) {
        showMenu();
        return;
      }
      currentRoom = room;
      currentRoom.code = code;
      // Fair-play: assign places when 2+ players in competitive, status=waiting and is host
      if (room.mode === 'competitive' && room.status === 'waiting' &&
          room.hostUid === profile.uid && Object.keys(room.players || {}).length >= 2 &&
          !room.assigns) {
        const placesArr = Object.keys(room.places || {}).map(id => ({ id: id, ...room.places[id] }));
        const playerUids = Object.keys(room.players);
        const assigns = assignPlaces(placesArr, room.target, playerUids.length);
        const final = {};
        playerUids.forEach((u, i) => { final[u] = assigns['p' + i] || []; });
        db.ref(`rooms/${code}/assigns`).set(final);
        db.ref(`rooms/${code}/status`).set('playing');
      }
      // Reset event
      if (room.resetDone && room.hostUid !== profile.uid) {
        showToast("L'hôte a réinitialisé la partie", 'red');
        leaveRoom();
        return;
      }
      // Winner detection
      if (room.winner && currentView !== 'gallery') {
        showGallery();
        return;
      }
      if (currentView === 'game' || currentView === 'lobby') renderGameScreen();
      else if (currentView === 'gallery') {/* keep */}
    });
  }
  if (currentRoom && currentRoom.mode === 'solo') {
    renderGameScreen();
  } else {
    renderGameScreen();
  }
  startWatchPosition();
  requestWakeLock();
}

function leaveRoom() {
  if (roomListener) { roomListener.off(); roomListener = null; }
  activeRoomCode = null;
  currentRoom = null;
  appState.currentRoom = null;
  saveState();
  stopWatchPosition();
  releaseWakeLock();
  showMenu();
}

/* ============================================================
   GAME SCREEN
   ============================================================ */
let gameTab = 'mine'; // mine | all | visited
let selectedOpponent = null;

function renderGameScreen() {
  if (!currentRoom) return;
  const room = currentRoom;
  // Lobby state for competitive
  if (room.mode === 'competitive' && room.status === 'waiting') {
    return renderLobby();
  }
  currentView = 'game';
  render(screen => {
    const myAssigns = (room.assigns && room.assigns[profile.uid]) || Object.keys(room.places || {});
    const visitsByMe = {};
    if (room.visits) {
      for (const pid in room.visits) {
        if (room.visits[pid] && room.visits[pid][profile.uid] && room.visits[pid][profile.uid].validated) {
          visitsByMe[pid] = room.visits[pid][profile.uid];
        }
      }
    }

    // Header info
    screen.append(
      el('div', { class: 'row between mb-14' },
        el('div', null,
          el('div', { class: 'small muted' }, 'Code'),
          el('div', { style: { fontFamily: 'SF Mono, monospace', fontWeight: 800, letterSpacing: 3 } }, room.code)
        ),
        el('div', { class: 'row gap-8' },
          el('button', { class: 'small ghost', onclick: () => leaveRoomConfirm() }, '↩ Quitter'),
          room.hostUid === profile.uid
            ? el('button', { class: 'small ghost', onclick: () => resetRoomConfirm() }, '↺')
            : null
        )
      )
    );

    // Player score cards
    screen.append(buildScoresUI(room));

    // Tabs
    const allPlaces = Object.keys(room.places || {}).map(id => ({ id, ...room.places[id] }));
    const myPlaces = myAssigns.map(id => allPlaces.find(p => p.id === id)).filter(Boolean);
    const visited = Object.keys(visitsByMe).map(id => allPlaces.find(p => p.id === id)).filter(Boolean);
    const filterTabs = el('div', { class: 'tabs mt-14 mb-14' },
      el('div', { class: 'tab' + (gameTab === 'all' ? ' active' : ''), onclick: () => { gameTab = 'all'; renderGameScreen(); } }, 'Tous (' + allPlaces.length + ')'),
      el('div', { class: 'tab' + (gameTab === 'mine' ? ' active' : ''), onclick: () => { gameTab = 'mine'; renderGameScreen(); } }, 'Mes objectifs (' + (myPlaces.length - visited.length) + ')'),
      el('div', { class: 'tab' + (gameTab === 'visited' ? ' active' : ''), onclick: () => { gameTab = 'visited'; renderGameScreen(); } }, 'Visités (' + visited.length + ')')
    );
    screen.append(filterTabs);

    // Now run banner
    screen.append(
      el('div', { class: 'now-run mb-14' }, '🏃', el('div', null, 'Now, run!'))
    );

    // Determine list to render
    let list = [];
    if (gameTab === 'all') list = allPlaces.filter(p => !visitsByMe[p.id]);
    else if (gameTab === 'mine') list = myPlaces.filter(p => !visitsByMe[p.id]);
    else list = visited;

    if (list.length === 0) {
      screen.append(el('div', { class: 'empty-state' },
        el('div', { class: 'ico' }, '🏁'),
        el('div', null, gameTab === 'visited' ? 'Aucun lieu validé pour le moment' : 'Tous les lieux sont validés !')
      ));
    }

    list.forEach(p => screen.append(buildPlaceCard(p, !!visitsByMe[p.id], visitsByMe[p.id])));

    // FAB compass — first non-visited place
    const target = list.find(p => !visitsByMe[p.id]) || (myPlaces.find(p => !visitsByMe[p.id]));
    if (target) {
      const fab = el('button', { class: 'fab', onclick: () => openCompass(target.id) }, '🧭');
      $('#app').appendChild(fab);
    }
  });
}

function buildScoresUI(room) {
  const wrap = el('div', { class: 'col gap-8' });
  const players = room.players || {};
  const target = room.target || 20;

  if (room.mode === 'group') {
    const totalPlaces = Object.keys(room.places || {}).length;
    let validated = 0;
    if (room.visits) {
      for (const pid in room.visits) {
        for (const uid in room.visits[pid]) {
          if (room.visits[pid][uid].validated) { validated++; break; }
        }
      }
    }
    const pct = totalPlaces ? validated / totalPlaces : 0;
    const cb = coverageBonus(pct);
    wrap.append(el('div', { class: 'card card-purple' },
      el('div', { class: 'row between mb-6' },
        el('div', { style: { fontWeight: 700 } }, '👥 ' + (room.teamName || 'Équipe')),
        el('div', null, (room.teamScore || 0).toFixed(1) + ' pts')
      ),
      el('div', { class: 'progress mb-6' },
        el('div', { style: { width: Math.min((room.teamScore || 0) / target * 100, 100) + '%', background: 'var(--purple)' } })
      ),
      el('div', { class: 'small muted' },
        `${validated}/${totalPlaces} lieux · Bonus couverture ×${cb.toFixed(1)}`
      )
    ));
  }

  for (const uid in players) {
    const p = players[uid];
    const sc = (room.scores && room.scores[uid]) || 0;
    const isMe = uid === profile.uid;
    const r = rankFromRating(p.rating || 1500);
    wrap.append(el('div', { class: 'card' + (isMe ? ' card-green' : '') },
      el('div', { class: 'row gap-10' },
        el('div', { class: 'avatar sm' }, p.avatar ? el('img', { src: p.avatar, alt: '' }) : (p.pseudo || '?').charAt(0).toUpperCase()),
        el('div', { class: 'flex1' },
          el('div', { class: 'row between' },
            el('div', { style: { fontWeight: 700 } }, p.pseudo + (isMe ? ' (toi)' : '')),
            el('div', null, sc.toFixed(1) + ' / ' + target)
          ),
          el('div', { class: 'progress mt-6' },
            el('div', { style: { width: Math.min(sc / target * 100, 100) + '%', background: isMe ? 'var(--green)' : 'var(--blue)' } })
          ),
          room.mode === 'competitive' ? el('div', { class: 'small muted mt-6' }, r.emoji + ' ' + r.name) : null
        )
      )
    ));
  }
  return wrap;
}

function buildPlaceCard(p, validated, visit) {
  const IR = calcRarity(p.validations || 0);
  const rar = rarityLabel(IR);
  const card = el('div', { class: 'card mb-10 tappable' });
  if (validated) {
    card.append(el('div', { class: 'place-row' },
      visit && visit.photo ? el('img', { class: 'thumb', src: visit.photo, alt: '' }) : el('div', { class: 'cat-icon' }, p.catEmoji || '📍'),
      el('div', { class: 'flex1' },
        el('div', { class: 'row between' },
          el('div', { style: { fontWeight: 600 } }, p.name),
          el('div', { class: 'small muted' }, visit ? visit.time : '')
        ),
        el('div', { class: 'small muted' }, '✅ ' + (visit ? visit.score.toFixed(1) : '0') + ' pts'),
        visit && visit.scoreBreakdown
          ? el('div', { class: 'score-line' },
              `${visit.scoreBreakdown.base} × ${visit.scoreBreakdown.IR} × ${visit.scoreBreakdown.endurance.toFixed(2)} × ${visit.scoreBreakdown.CDC} × ${visit.scoreBreakdown.multiplier} = ${visit.score.toFixed(1)}`)
          : null
      )
    ));
    card.addEventListener('click', () => {
      if (visit && visit.photo) showFullscreenPhoto(visit.photo, p.name);
    });
  } else {
    card.append(el('div', { class: 'place-row' },
      el('div', { class: 'cat-icon' }, p.catEmoji || '📍'),
      el('div', { class: 'flex1' },
        el('div', { class: 'row between' },
          el('div', { style: { fontWeight: 600 } }, p.name),
          el('div', { class: 'small muted' }, fmtDistance(p.distance || haversine(currentRoom.startLat, currentRoom.startLng, p.lat, p.lng)))
        ),
        el('div', { class: 'row gap-6 mt-6' },
          el('span', { class: 'tag green' }, p.pts + ' pts'),
          p.certified ? el('span', { class: 'tag amber' }, '🏅 Certifié') : el('span', { class: 'tag blue' }, '⭐ Communauté'),
          el('span', { class: 'tag' }, rar)
        )
      )
    ));
    card.addEventListener('click', () => openValidation(p));
  }
  return card;
}

function leaveRoomConfirm() {
  confirmDialog('Quitter la partie', 'Tu pourras la rejoindre plus tard avec le code.', () => leaveRoom());
}

function resetRoomConfirm() {
  confirmDialog('Réinitialiser ?', "Tous les joueurs seront renvoyés à l'accueil.", () => {
    confirmDialog('Confirmer la réinitialisation', 'Cette action est irréversible.', async () => {
      if (firebaseReady && activeRoomCode) {
        await db.ref('rooms/' + activeRoomCode + '/resetDone').set(true);
        await db.ref('rooms/' + activeRoomCode + '/status').set('finished');
      }
      leaveRoom();
    });
  });
}

/* ============================================================
   LOBBY (competitive only, status=waiting)
   ============================================================ */
function renderLobby() {
  currentView = 'lobby';
  render(screen => {
    const room = currentRoom;
    const players = Object.keys(room.players || {});
    screen.append(
      el('h2', null, '⚔️ En attente de joueurs'),
      el('p', { class: 'muted mb-14' }, "Partage le code à tes adversaires pour qu'ils rejoignent."),
      el('div', { class: 'code-display mb-14' }, room.code),
      el('div', { class: 'card mb-14' },
        el('h3', null, `Joueurs (${players.length}/${(room.maxOpponents || 1) + 1})`),
        ...players.map(uid => {
          const p = room.players[uid];
          return el('div', { class: 'list-row' },
            el('div', { class: 'avatar sm' }, p.avatar ? el('img', { src: p.avatar, alt: '' }) : (p.pseudo || '?').charAt(0).toUpperCase()),
            el('div', { class: 'flex1' }, p.pseudo, uid === profile.uid ? ' (toi)' : '', uid === room.hostUid ? ' 👑' : ''),
            el('div', { class: 'small muted' }, rankFromRating(p.rating || 1500).emoji)
          );
        })
      ),
      room.hostUid === profile.uid && players.length >= 2
        ? el('button', { class: 'primary full', onclick: () => {
            // Force start
            const placesArr = Object.keys(room.places).map(id => ({ id, ...room.places[id] }));
            const assigns = assignPlaces(placesArr, room.target, players.length);
            const final = {};
            players.forEach((u, i) => { final[u] = assigns['p' + i] || []; });
            db.ref(`rooms/${room.code}/assigns`).set(final);
            db.ref(`rooms/${room.code}/status`).set('playing');
          }}, '▶ Lancer maintenant')
        : el('div', { class: 'muted center' }, players.length < 2 ? "En attente d'au moins 2 joueurs..." : "En attente du lancement par l'hôte..."),
      el('div', { class: 'mt-18' },
        el('button', { class: 'ghost full', onclick: leaveRoomConfirm }, 'Quitter')
      )
    );
  });
}

/* ============================================================
   VALIDATION (camera, GPS check)
   ============================================================ */
function openValidation(place) {
  let pos = appState.lastGPS;
  if (!pos) {
    showToast('Position GPS non disponible — autorise la géoloc', 'red');
    return;
  }
  const distance = haversine(pos.lat, pos.lng, place.lat, place.lng);
  const m = showModal([
    el('h2', null, place.name),
    el('div', { class: 'muted small mb-14' }, place.catEmoji + ' ' + place.cat),
    distance > 30
      ? el('div', null,
          el('div', { class: 'card mb-14', style: { background: 'rgba(239,68,68,0.1)', borderColor: 'var(--red)' } },
            el('div', { style: { fontWeight: 700, color: 'var(--red)' } }, '📏 Trop loin pour valider'),
            el('div', { class: 'small muted mt-6' }, 'Approche-toi à moins de 30m. Distance actuelle : ' + fmtDistance(distance))
          ),
          el('button', { class: 'full primary', onclick: () => { closeModals(); openCompass(place.id); } }, '🧭 Activer la boussole')
        )
      : el('div', null,
          el('div', { class: 'card mb-14', style: { background: 'rgba(34,197,94,0.1)', borderColor: 'var(--green)' } },
            el('div', { style: { fontWeight: 700, color: 'var(--green)' } }, '✅ Tu es sur place !'),
            el('div', { class: 'small muted mt-6' }, 'Prends une photo pour valider.')
          ),
          buildCameraUI(place)
        ),
    el('button', { class: 'ghost full mt-14', onclick: closeModals }, 'Annuler')
  ]);
}

function buildCameraUI(place) {
  const wrap = el('div', null);
  const fileIn = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  const previewWrap = el('div', { class: 'mb-14' });
  let blob = null;
  fileIn.addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      blob = await compressImage(f, 1024, 0.8);
      const url = URL.createObjectURL(blob);
      previewWrap.innerHTML = '';
      previewWrap.appendChild(el('img', { src: url, style: { width: '100%', borderRadius: '12px', maxHeight: '300px', objectFit: 'cover' } }));
    } catch (e) { showToast('Erreur photo', 'red'); }
  });
  wrap.append(
    previewWrap,
    fileIn,
    el('button', { class: 'primary full mb-10', onclick: () => fileIn.click() }, '📸 Prendre une photo'),
    el('button', { class: 'full', onclick: async () => {
      if (!blob) return showToast("Prends une photo d'abord", 'red');
      await confirmValidation(place, blob);
    }}, 'Confirmer la validation')
  );
  return wrap;
}

async function confirmValidation(place, blob) {
  const room = currentRoom;
  if (!room) return;
  closeModals();
  const loadingM = showModal([
    el('h2', null, 'Validation en cours'),
    el('div', { class: 'spinner' }),
    el('div', { class: 'muted center' }, 'Upload de la photo...')
  ], { locked: true });

  let photoURL = null;
  try {
    if (firebaseReady) {
      const path = `photos/${room.code}/${place.id}/${profile.uid}_${Date.now()}.jpg`;
      const ref = storage.ref(path);
      await ref.put(blob, { contentType: 'image/jpeg' });
      photoURL = await ref.getDownloadURL();
    }
  } catch (e) {
    console.error('upload err', e);
    // Fallback: data URL
    photoURL = await new Promise(res => {
      const r = new FileReader();
      r.onload = ev => res(ev.target.result);
      r.readAsDataURL(blob);
    });
  }

  // Compute score
  const isFirstFlash = (place.validations || 0) === 0;
  const session = {
    distanceWalked: appState.sessionDistance || 0,
    radius: room.radius,
    suspectSpeed: false
  };
  const score = calcScore(place, session, room.mode, room.mode === 'solo' ? null : 'win');

  // Push visit
  const visit = {
    validated: true,
    time: fmtTime(),
    photo: photoURL,
    score: score.total,
    scoreBreakdown: score,
    isFirstFlash: isFirstFlash,
    uid: profile.uid,
    pseudo: profile.pseudo,
    ts: Date.now()
  };

  if (firebaseReady) {
    await db.ref(`rooms/${room.code}/visits/${place.id}/${profile.uid}`).set(visit);
    // Update score
    const myScore = (room.scores && room.scores[profile.uid]) || 0;
    const newScore = parseFloat((myScore + score.total).toFixed(1));
    await db.ref(`rooms/${room.code}/scores/${profile.uid}`).set(newScore);
    // Update place validations
    if (place.id.startsWith('osm_')) {
      const placeRef = db.ref('places/' + place.id);
      const snap = await placeRef.once('value');
      const ex = snap.val() || { id: place.id, name: place.name, lat: place.lat, lng: place.lng, validations: 0, status: 'new' };
      ex.validations = (ex.validations || 0) + 1;
      if (ex.validations >= 1 && ex.status === 'new') ex.status = 'watching';
      if (ex.validations >= 5) ex.status = 'validated';
      if (ex.validations >= 20) ex.status = 'certified';
      if (isFirstFlash) ex.firstFlashUid = profile.uid;
      await placeRef.set(ex);
    }
    // Update room places counters
    const roomPlaceRef = db.ref(`rooms/${room.code}/places/${place.id}/validations`);
    await roomPlaceRef.set((place.validations || 0) + 1);
    // Group: update teamScore + coverage
    if (room.mode === 'group') {
      const fresh = (await db.ref('rooms/' + room.code).once('value')).val();
      let total = 0;
      if (fresh && fresh.scores) for (const u in fresh.scores) total += fresh.scores[u];
      const totalPlaces = Object.keys(fresh.places || {}).length;
      let validated = 0;
      if (fresh.visits) {
        for (const pid in fresh.visits) {
          for (const u in fresh.visits[pid]) if (fresh.visits[pid][u].validated) { validated++; break; }
        }
      }
      const pct = totalPlaces ? validated / totalPlaces : 0;
      const cb = coverageBonus(pct);
      await db.ref('rooms/' + room.code + '/teamScore').set(parseFloat((total * cb).toFixed(1)));
      await db.ref('rooms/' + room.code + '/coverageBonus').set(cb);
    }
    // Check winner
    await checkWinner(room.code);
  }

  // Update profile stats
  if (room.mode === 'solo') profile.scores.solo = parseFloat((profile.scores.solo + score.total).toFixed(1));
  else if (room.mode === 'competitive') profile.scores.competitive = parseFloat((profile.scores.competitive + score.total).toFixed(1));
  else profile.scores.group = parseFloat((profile.scores.group + score.total).toFixed(1));
  profile.scores.total = parseFloat((profile.scores.solo + profile.scores.competitive + profile.scores.group).toFixed(1));
  profile.xp = (profile.xp || 0) + Math.floor(score.total * 10);
  const newLv = levelFromXP(profile.xp);
  if (newLv > profile.level) {
    profile.level = newLv;
    showToast('🎉 Niveau ' + newLv + ' atteint !', 'green');
  }
  // Streak
  const today = new Date().toDateString();
  if (profile.streak.lastPlay !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (profile.streak.lastPlay === yesterday) profile.streak.current++;
    else profile.streak.current = 1;
    if (profile.streak.current > profile.streak.best) profile.streak.best = profile.streak.current;
    profile.streak.lastPlay = today;
    if (profile.streak.current >= 7) awardBadge('premiere_semaine');
    if (profile.streak.current >= 30) awardBadge('mois_complet');
    if (profile.streak.current >= 100) awardBadge('cent_jours');
    if (profile.streak.current >= 365) awardBadge('annee');
  }
  // Stats: city/country/continent
  if (room.city && !profile.stats.cities.includes(room.city)) profile.stats.cities.push(room.city);
  if (room.country && !profile.stats.countries.includes(room.country)) profile.stats.countries.push(room.country);
  if (room.continent && !profile.stats.continents.includes(room.continent)) profile.stats.continents.push(room.continent);
  if (room.city) {
    profile.placesByCity = profile.placesByCity || {};
    profile.placesByCity[room.city] = (profile.placesByCity[room.city] || 0) + 1;
  }
  saveProfile();
  checkBadgesAfterValidation(place, { city: room.city, country: room.country, continent: room.continent }, isFirstFlash, new Date().getHours());
  // Iron walker
  if ((appState.sessionDistance || 0) > 5000) awardBadge('iron_walker');

  loadingM.remove();
  showRatingPrompt(place, score, isFirstFlash);
}

function showRatingPrompt(place, score, isFirstFlash) {
  let findable = null, interesting = null, photoable = null;
  const m = showModal([
    el('h2', null, '🎉 +' + score.total + ' pts'),
    isFirstFlash ? el('div', { class: 'tag amber mb-14' }, '⚡ FIRST FLASH! Bonus IR ×3 inclus') : null,
    el('div', { class: 'card mb-14' },
      el('div', { class: 'small muted mb-6' }, 'Détail du score'),
      el('div', { class: 'score-line' },
        `base ${score.base} × IR ${score.IR} × endur ${score.endurance.toFixed(2)} × CDC ${score.CDC} × ×${score.multiplier} = ${score.total}`)
    ),
    el('h3', null, 'Note ce lieu'),
    el('div', { class: 'col gap-10' },
      makeRatingRow('📍 Trouvable facilement ?', v => findable = v),
      makeRatingRow('🎯 Intéressant ?', v => interesting = v),
      makeRatingRow('📸 Photogénique ?', v => photoable = v)
    ),
    el('button', { class: 'primary full mt-14', onclick: async () => {
      if (firebaseReady && place.id.startsWith('osm_')) {
        const ref = db.ref('places/' + place.id + '/scores');
        const snap = await ref.once('value');
        const cur = snap.val() || { findable: 0, interesting: 0, photoable: 0, n: 0 };
        const n = (cur.n || 0) + 1;
        if (findable !== null) cur.findable = ((cur.findable || 0) * (n - 1) + (findable ? 1 : 0)) / n;
        if (interesting !== null) cur.interesting = ((cur.interesting || 0) * (n - 1) + (interesting ? 1 : 0)) / n;
        if (photoable !== null) cur.photoable = ((cur.photoable || 0) * (n - 1) + (photoable ? 1 : 0)) / n;
        cur.n = n;
        await ref.set(cur);
      }
      closeModals();
    }}, 'Continuer')
  ]);
}

function makeRatingRow(label, onChange) {
  let val = null;
  const upBtn = el('button', { class: 'flex1', onclick: () => { val = true; updateUI(); onChange(true); } }, '👍');
  const downBtn = el('button', { class: 'flex1', onclick: () => { val = false; updateUI(); onChange(false); } }, '👎');
  function updateUI() {
    upBtn.style.background = val === true ? 'var(--green)' : 'var(--bg2)';
    downBtn.style.background = val === false ? 'var(--red)' : 'var(--bg2)';
  }
  return el('div', null,
    el('div', { class: 'small muted mb-6' }, label),
    el('div', { class: 'row gap-8' }, upBtn, downBtn)
  );
}

async function checkWinner(code) {
  const room = (await db.ref('rooms/' + code).once('value')).val();
  if (!room || room.winner) return;
  const target = room.target || 20;
  if (room.mode === 'solo') return; // solo no winner
  if (room.mode === 'competitive') {
    for (const uid in (room.scores || {})) {
      if (room.scores[uid] >= target) {
        await db.ref('rooms/' + code + '/winner').set(uid);
        await db.ref('rooms/' + code + '/status').set('finished');
        await applyGlickoForRoom(room, uid);
        return;
      }
    }
  } else if (room.mode === 'group') {
    if ((room.teamScore || 0) >= target) {
      await db.ref('rooms/' + code + '/winner').set('team');
      await db.ref('rooms/' + code + '/status').set('finished');
      // Perfect run check
      const totalPlaces = Object.keys(room.places || {}).length;
      let validated = 0;
      if (room.visits) {
        for (const pid in room.visits) {
          for (const u in room.visits[pid]) if (room.visits[pid][u].validated) { validated++; break; }
        }
      }
      if (totalPlaces > 0 && validated / totalPlaces >= 0.9) {
        // Award perfect run for all participants
        for (const uid in (room.players || {})) {
          if (uid === profile.uid) {
            awardBadge('perfect_run');
            awardBadge('equipier_parfait');
            profile.stats.perfectRuns = (profile.stats.perfectRuns || 0) + 1;
            saveProfile();
          }
        }
      }
    }
  }
}

async function applyGlickoForRoom(room, winnerUid) {
  const playerUids = Object.keys(room.players || {});
  // Sort by final scores desc
  const sorted = playerUids.map(uid => ({ uid, score: (room.scores && room.scores[uid]) || 0 }))
                            .sort((a, b) => b.score - a.score);
  const ratings = {};
  playerUids.forEach(uid => { ratings[uid] = room.players[uid].rating || 1500; });
  // Update only the local player
  const me = profile.uid;
  if (!playerUids.includes(me)) return;
  const myRank = sorted.findIndex(s => s.uid === me);
  const results = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].uid === me) continue;
    const opp = room.players[sorted[i].uid];
    let res;
    if (myRank < i) res = 1; else if (myRank > i) res = 0; else res = 0.5;
    results.push({ rating: opp.rating || 1500, rd: 350, score: res });
  }
  const upd = updateGlicko(profile.glicko, results);
  profile.glicko = upd;
  if (winnerUid === me) {
    awardBadge('premiere_victoire');
  }
  saveProfile();
}

/* ============================================================
   COMPASS
   ============================================================ */
let compassRAF = null;
let compassPlace = null;

function openCompass(placeId) {
  const room = currentRoom;
  if (!room || !room.places || !room.places[placeId]) return;
  compassPlace = { id: placeId, ...room.places[placeId] };
  setupOrientation(() => {});
  const wrap = el('div', { class: 'compass-wrap' });
  const close = el('button', { style: { alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 18, padding: '8px 0' }, onclick: () => {
    cancelAnimationFrame(compassRAF);
    wrap.remove();
    compassPlace = null;
  }}, '← Retour');
  const title = el('h2', { class: 'center' }, compassPlace.name);
  const distLabel = el('div', { class: 'distance-label' }, '...');
  const circle = el('div', { class: 'compass-circle' });
  const arrow = el('div', { class: 'compass-arrow' });
  const radar = el('div', { class: 'compass-radar', style: { display: 'none' } });
  circle.append(arrow, radar);
  const validateBtn = el('button', { class: 'primary full mt-14', style: { display: 'none' }, onclick: () => {
    cancelAnimationFrame(compassRAF);
    wrap.remove();
    openValidation(compassPlace);
  }}, '✓ Je suis sur place — valider');
  wrap.append(close, title, circle, distLabel, validateBtn);
  document.body.appendChild(wrap);

  function tick() {
    if (!compassPlace || !appState.lastGPS) {
      compassRAF = requestAnimationFrame(tick);
      return;
    }
    const pos = appState.lastGPS;
    const d = haversine(pos.lat, pos.lng, compassPlace.lat, compassPlace.lng);
    const bearing = getBearing(pos, compassPlace);
    const arrowAngle = (bearing - currentHeading + 360) % 360;
    arrow.style.transform = 'rotate(' + arrowAngle + 'deg)';
    arrow.style.borderBottomColor = distanceColor(d);
    distLabel.textContent = fmtDistance(d);
    distLabel.style.color = distanceColor(d);
    if (d < 30) {
      arrow.style.display = 'none';
      radar.style.display = 'block';
      distLabel.textContent = '✅ Tu es sur place !';
      validateBtn.style.display = 'block';
    } else {
      arrow.style.display = 'block';
      radar.style.display = 'none';
      validateBtn.style.display = 'none';
    }
    compassRAF = requestAnimationFrame(tick);
  }
  tick();
}

/* ============================================================
   GALLERY (end of game)
   ============================================================ */
function showGallery() {
  currentView = 'gallery';
  render(screen => {
    const room = currentRoom;
    if (!room) return showMenu();
    // banner
    let bannerText = '';
    const winner = room.winner;
    if (winner === 'team') {
      const totalPlaces = Object.keys(room.places || {}).length;
      let validated = 0;
      if (room.visits) {
        for (const pid in room.visits) {
          for (const u in room.visits[pid]) if (room.visits[pid][u].validated) { validated++; break; }
        }
      }
      const pct = totalPlaces ? validated / totalPlaces : 0;
      bannerText = `Équipe ${room.teamName || ''} ${pct >= 0.9 ? '— Perfect Run ! 🏆' : 'a gagné ! 🏆'}`;
    } else if (winner && room.players && room.players[winner]) {
      bannerText = (room.players[winner].pseudo) + ' a gagné ! 🏆';
    } else {
      bannerText = 'Partie terminée';
    }

    screen.append(el('div', { class: 'banner-win' }, bannerText));

    // Build photos list from visits
    const items = [];
    if (room.visits) {
      for (const pid in room.visits) {
        for (const uid in room.visits[pid]) {
          const v = room.visits[pid][uid];
          if (v && v.validated) {
            items.push({
              place: room.places[pid] ? room.places[pid].name : '?',
              pseudo: room.players && room.players[uid] ? room.players[uid].pseudo : '?',
              photo: v.photo,
              time: v.time, score: v.score,
              breakdown: v.scoreBreakdown
            });
          }
        }
      }
    }
    items.sort((a, b) => b.score - a.score);

    if (items.length === 0) {
      screen.append(el('div', { class: 'empty-state' }, '📷 Aucune photo enregistrée'));
    } else {
      const grid = el('div', { class: 'gallery-grid' });
      items.forEach(it => {
        const node = el('div', { class: 'gallery-item', onclick: () => showFullscreenPhoto(it.photo, it.place + ' — ' + it.pseudo) },
          it.photo ? el('img', { src: it.photo, alt: '' }) : el('div', { style: { aspectRatio: 1, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 } }, '📷'),
          el('div', { class: 'info' },
            el('div', { style: { fontWeight: 600 } }, it.place),
            el('div', { class: 'small muted' }, it.pseudo + ' · ' + it.time),
            el('div', { class: 'small', style: { color: 'var(--green)' } }, '+' + it.score.toFixed(1) + ' pts'),
            it.breakdown
              ? el('div', { class: 'score-line' },
                  `${it.breakdown.base}×${it.breakdown.IR}×${it.breakdown.endurance.toFixed(2)}×${it.breakdown.CDC}×${it.breakdown.multiplier}`)
              : null
          )
        );
        grid.appendChild(node);
      });
      screen.appendChild(grid);
    }

    screen.append(
      el('div', { class: 'mt-18 col gap-8' },
        el('button', { class: 'primary full', onclick: () => leaveRoom() }, 'Nouvelle partie')
      )
    );
  });
}

function showFullscreenPhoto(url, caption) {
  if (!url) return;
  const wrap = el('div', { class: 'photo-fullscreen' },
    el('img', { src: url, alt: caption || '' }),
    el('div', { style: { position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center', color: 'white', fontSize: 14 } }, caption || ''),
    el('button', { class: 'close', onclick: () => wrap.remove() }, '×')
  );
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
}

/* ============================================================
   PROFILE SCREEN
   ============================================================ */
function showProfile() {
  currentView = 'profile';
  // Stop any ongoing room listener
  if (roomListener) { roomListener.off(); roomListener = null; }
  stopWatchPosition();
  render(screen => {
    const lv = profile.level;
    const xpCur = profile.xp;
    const xpNext = xpForLevel(lv + 1);
    const xpPrev = xpForLevel(lv);
    const pct = Math.min((xpCur - xpPrev) / Math.max(xpNext - xpPrev, 1), 1);
    const r = rankFromRating(profile.glicko.rating);
    const titleObj = TITLES.find(t => t.name === profile.title) || TITLES[0];
    const spg = calcSPG(profile.stats);

    screen.append(
      el('div', { class: 'card mb-14' },
        el('div', { class: 'row gap-12' },
          el('div', { class: 'avatar lg' + (profile.stats.continents.length >= 4 ? ' gold-frame' : '') },
            profile.avatar ? el('img', { src: profile.avatar, alt: '' }) : profile.pseudo.charAt(0).toUpperCase()),
          el('div', { class: 'flex1' },
            el('div', { style: { fontSize: 20, fontWeight: 800 } }, profile.pseudo),
            el('div', { class: 'small muted' }, titleObj.emoji + ' ' + titleObj.name),
            el('div', { class: 'small', style: { color: r.color } }, r.emoji + ' ' + r.name),
            el('div', { class: 'small muted mt-6' }, 'Niveau ' + lv),
            el('div', { class: 'progress mt-6' },
              el('div', { style: { width: (pct * 100) + '%' } })
            ),
            el('div', { class: 'small muted mt-6' }, `${xpCur} / ${xpNext} XP`)
          )
        )
      ),
      el('div', { class: 'row gap-8 mb-14' },
        el('button', { class: 'flex1 ghost', onclick: () => editTitle() }, 'Changer titre'),
        el('button', { class: 'flex1 ghost', onclick: () => editProfile() }, '✏️ Profil')
      ),
      el('div', { class: 'card mb-14' },
        el('h3', null, 'Score global'),
        el('div', { style: { fontSize: 28, fontWeight: 800 } }, profile.scores.total.toFixed(0) + ' pts'),
        el('div', { class: 'col gap-6 mt-10' },
          el('div', { class: 'row between' }, el('span', { class: 'muted' }, 'Solo'), el('span', null, profile.scores.solo.toFixed(0) + ' pts')),
          el('div', { class: 'row between' }, el('span', { class: 'muted' }, 'Compétitif'), el('span', null, profile.scores.competitive.toFixed(0) + ' pts')),
          el('div', { class: 'row between' }, el('span', { class: 'muted' }, 'Groupe'), el('span', null, profile.scores.group.toFixed(0) + ' pts')),
          el('div', { class: 'row between' }, el('span', { class: 'muted' }, 'SPG'), el('span', null, spg + ' pts'))
        )
      ),
      el('div', { class: 'card mb-14' },
        el('h3', null, 'Exploration'),
        el('div', { class: 'small' },
          `🌍 ${profile.stats.cities.length} ville${profile.stats.cities.length > 1 ? 's' : ''} · ${profile.stats.countries.length} pays · ${profile.stats.continents.length} continent${profile.stats.continents.length > 1 ? 's' : ''}`
        ),
        el('div', { class: 'small mt-6' },
          `🔥 Streak ${profile.streak.current}j (record ${profile.streak.best}j) · ⚡ ${profile.stats.firstFlashes || 0} First Flash · 🏅 Perfect Run ×${profile.stats.perfectRuns || 0}`
        )
      ),
      el('div', { class: 'card mb-14' },
        el('h3', null, 'Badges (' + profile.badges.length + '/' + (Object.keys(BADGES).length) + ')'),
        buildBadgeGrid()
      ),
      el('div', { class: 'mt-18' },
        el('button', { class: 'ghost full', onclick: () => {
          confirmDialog('Réinitialiser le profil ?', 'Toutes les données locales seront effacées.', () => {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(STATE_KEY);
            location.reload();
          });
        }}, 'Réinitialiser mon profil')
      )
    );
  });
}

function buildBadgeGrid() {
  const grid = el('div', { class: 'badge-grid' });
  for (const id in BADGES) {
    const b = BADGES[id];
    const owned = profile.badges.includes(id);
    if (b.secret && !owned) continue; // hide unrevealed secrets
    grid.appendChild(el('div', {
      class: 'badge' + (owned ? '' : ' locked') + (owned && b.animated ? ' animated' : ''),
      title: b.name,
      onclick: () => showToast(b.name + (owned ? '' : ' — verrouillé'))
    }, b.emoji, el('div', { class: 'name' }, b.name)));
  }
  return grid;
}

function editTitle() {
  const lv = profile.level;
  const list = TITLES.filter(t => t.lv <= lv);
  showModal([
    el('h2', null, 'Choisir un titre'),
    el('p', { class: 'muted mb-14' }, "Tu peux afficher l'un de ces titres débloqués."),
    el('div', { class: 'col gap-8' },
      ...list.map(t => el('button', { class: 'full' + (profile.title === t.name ? ' primary' : ''), onclick: () => {
        profile.title = t.name;
        profile.titleEmoji = t.emoji;
        saveProfile();
        closeModals();
        showProfile();
      }}, t.emoji + '  ' + t.name + '  · Nv ' + t.lv))
    )
  ]);
}

function editProfile() {
  const pseudoIn = el('input', { value: profile.pseudo, maxlength: 24 });
  const fileIn = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  let newAvatar = profile.avatar;
  const avatarBox = el('div', { class: 'avatar lg', onclick: () => fileIn.click() },
    newAvatar ? el('img', { src: newAvatar, alt: '' }) : profile.pseudo.charAt(0).toUpperCase());
  fileIn.addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const b = await compressImage(f, 256, 0.85);
      const r = new FileReader();
      r.onload = ev => { newAvatar = ev.target.result; avatarBox.innerHTML = ''; avatarBox.appendChild(el('img', { src: newAvatar, alt: '' })); };
      r.readAsDataURL(b);
    } catch (_) {}
  });
  showModal([
    el('h2', null, 'Modifier le profil'),
    el('div', { class: 'col gap-12' },
      el('div', { class: 'row gap-12' }, avatarBox,
        el('button', { class: 'flex1', onclick: () => fileIn.click() }, 'Changer photo'), fileIn),
      el('div', null, el('div', { class: 'small muted mb-6' }, 'Pseudo'), pseudoIn)
    ),
    el('div', { class: 'row gap-8 mt-14' },
      el('button', { class: 'flex1 ghost', onclick: closeModals }, 'Annuler'),
      el('button', { class: 'flex1 primary', onclick: () => {
        const ps = pseudoIn.value.trim();
        if (ps.length < 2) return showToast('Pseudo trop court', 'red');
        profile.pseudo = ps;
        profile.avatar = newAvatar;
        saveProfile();
        closeModals();
        showProfile();
      }}, 'Enregistrer')
    )
  ]);
}

/* ============================================================
   RANKINGS
   ============================================================ */
let rankingTab = 'comp';
let rankingScope = 'world';

function showRankings() {
  currentView = 'rankings';
  if (roomListener) { roomListener.off(); roomListener = null; }
  stopWatchPosition();
  render(screen => {
    screen.append(
      el('h1', null, '🏆 Classements'),
      el('div', { class: 'tabs mt-14 mb-14' },
        el('div', { class: 'tab' + (rankingTab === 'comp' ? ' active' : ''), onclick: () => { rankingTab = 'comp'; showRankings(); } }, 'Compétitif'),
        el('div', { class: 'tab' + (rankingTab === 'global' ? ' active' : ''), onclick: () => { rankingTab = 'global'; showRankings(); } }, 'Global'),
        el('div', { class: 'tab' + (rankingTab === 'friends' ? ' active' : ''), onclick: () => { rankingTab = 'friends'; showRankings(); } }, 'Amis')
      ),
      el('div', { class: 'tabs mb-14' },
        el('div', { class: 'tab' + (rankingScope === 'world' ? ' active' : ''), onclick: () => { rankingScope = 'world'; showRankings(); } }, 'Monde'),
        el('div', { class: 'tab' + (rankingScope === 'country' ? ' active' : ''), onclick: () => { rankingScope = 'country'; showRankings(); } }, 'Pays'),
        el('div', { class: 'tab' + (rankingScope === 'city' ? ' active' : ''), onclick: () => { rankingScope = 'city'; showRankings(); } }, 'Ville')
      )
    );

    const listWrap = el('div', { class: 'card' }, el('div', { class: 'spinner' }));
    screen.append(listWrap);
    if (rankingTab === 'friends') screen.append(buildFriendsManager());

    loadRankings(listWrap);
  });
}

function buildFriendsManager() {
  const inp = el('input', { placeholder: 'Pseudo ou UID' });
  return el('div', { class: 'card mt-14' },
    el('h3', null, 'Ajouter un ami'),
    el('div', { class: 'row gap-8' },
      inp,
      el('button', { onclick: async () => {
        const q = inp.value.trim();
        if (!q) return;
        if (!firebaseReady) return showToast('Firebase indisponible', 'red');
        const snap = await db.ref('players').once('value');
        const all = snap.val() || {};
        let foundUid = null;
        if (all[q]) foundUid = q;
        else {
          for (const uid in all) {
            if ((all[uid].pseudo || '').toLowerCase() === q.toLowerCase()) { foundUid = uid; break; }
          }
        }
        if (!foundUid) return showToast('Joueur introuvable', 'red');
        if (!profile.friends.includes(foundUid)) {
          profile.friends.push(foundUid);
          saveProfile();
          showToast('Ami ajouté ✅', 'green');
          if (profile.friends.length >= 3) awardBadge('recruteur');
          showRankings();
        }
      }}, 'Ajouter')
    )
  );
}

async function loadRankings(container) {
  if (!firebaseReady) {
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'empty-state' }, 'Firebase indisponible'));
    return;
  }
  try {
    const snap = await db.ref('players').once('value');
    const all = snap.val() || {};
    let players = Object.keys(all).map(uid => ({ uid, ...all[uid] }));
    // Scope filter (best effort: country/city stored on player when first session)
    if (rankingScope === 'country' && profile.stats.countries.length) {
      const myCountry = profile.stats.countries[profile.stats.countries.length - 1];
      players = players.filter(p => (p.stats && p.stats.countries || []).includes(myCountry));
    } else if (rankingScope === 'city' && profile.stats.cities.length) {
      const myCity = profile.stats.cities[profile.stats.cities.length - 1];
      players = players.filter(p => (p.stats && p.stats.cities || []).includes(myCity));
    }
    if (rankingTab === 'friends') {
      players = players.filter(p => profile.friends.includes(p.uid) || p.uid === profile.uid);
    }
    if (rankingTab === 'comp') {
      players.sort((a, b) => (b.glicko && b.glicko.rating || 0) - (a.glicko && a.glicko.rating || 0));
    } else {
      players.sort((a, b) => {
        const sA = (a.scores && a.scores.total || 0) + calcSPG(a.stats || { cities: [], countries: [], continents: [] });
        const sB = (b.scores && b.scores.total || 0) + calcSPG(b.stats || { cities: [], countries: [], continents: [] });
        return sB - sA;
      });
    }
    players = players.slice(0, 100);
    container.innerHTML = '';
    if (players.length === 0) {
      container.appendChild(el('div', { class: 'empty-state' }, 'Aucun joueur trouvé'));
      return;
    }
    players.forEach((p, i) => {
      const isMe = p.uid === profile.uid;
      const r = rankFromRating((p.glicko && p.glicko.rating) || 1500);
      const rightVal = rankingTab === 'comp'
        ? Math.round((p.glicko && p.glicko.rating) || 1500) + ' pts'
        : Math.round((p.scores && p.scores.total || 0) + calcSPG(p.stats || { cities:[],countries:[],continents:[] })) + ' pts';
      const rightSub = rankingTab === 'comp' ? r.name : (((p.stats && p.stats.cities) || []).length + ' villes');
      container.appendChild(
        el('div', { class: 'list-row' + (isMe ? '' : ''), style: isMe ? { background: 'rgba(34,197,94,0.05)' } : {} },
          el('div', { class: 'rank-num' }, '#' + (i + 1)),
          el('div', { class: 'avatar sm' }, p.avatar ? el('img', { src: p.avatar, alt: '' }) : (p.pseudo || '?').charAt(0).toUpperCase()),
          el('div', { class: 'flex1' },
            el('div', { style: { fontWeight: 600 } }, (p.pseudo || '?') + (isMe ? ' (toi)' : '')),
            el('div', { class: 'small muted' }, rightSub)
          ),
          el('div', { style: { fontWeight: 700 } }, rightVal)
        )
      );
    });
  } catch (e) {
    console.error(e);
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'empty-state' }, 'Erreur de chargement'));
  }
}

/* ============================================================
   BOOT
   ============================================================ */
function boot() {
  if (!profile) return showOnboarding();
  // Resume room?
  if (appState.currentRoom && firebaseReady) {
    db.ref('rooms/' + appState.currentRoom).once('value').then(snap => {
      const room = snap.val();
      if (room && room.players && room.players[profile.uid] && room.status !== 'finished') {
        enterRoom(appState.currentRoom);
      } else {
        appState.currentRoom = null;
        saveState();
        showMenu();
      }
    }).catch(() => showMenu());
  } else {
    showMenu();
  }
}

window.addEventListener('load', boot);

// Periodic profile sync
setInterval(() => {
  if (profile && firebaseReady) {
    db.ref('players/' + profile.uid).update({
      pseudo: profile.pseudo, avatar: profile.avatar, scores: profile.scores,
      glicko: profile.glicko, level: profile.level, xp: profile.xp,
      streak: profile.streak, stats: profile.stats, badges: profile.badges,
      title: profile.title, friends: profile.friends || []
    }).catch(()=>{});
  }
}, 30000);

// Service Worker (basic offline shell)
if ('serviceWorker' in navigator) {
  // Inline SW: cache nothing here (single file, GitHub Pages)
}