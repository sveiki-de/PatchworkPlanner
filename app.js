/* PatchworkPlanner – Oberfläche (ausgelagert aus index.html wegen Content-Security-Policy) */
/* Q8: nicht in fremden Seiten (Rahmen) anzeigen */
if (window.top !== window.self){ document.body.innerHTML = '<p style="padding:20px;font-family:sans-serif">Bitte direkt öffnen: <a href="' + location.href.replace(/"/g, '') + '" target="_top">Kinderplanung</a></p>'; throw new Error('Einbettung nicht erlaubt'); }
let VAULT = null;
const LS_KEY = 'kinderplanung_pin';
/* Server für Lesen und Speichern (Phase 7); Adresse und Plan-Kennung stehen in index.html */
const metaVal = n => { const m = document.querySelector(`meta[name="${n}"]`); return m ? m.content : ''; };
const SERVER = metaVal('planer-server'), PLAN_ID = metaVal('planer-kennung');
const sfetch = (u, o) => fetch(u, o);
const MONATE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MON_KURZ = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const WDS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
let KINDER = ['A','M','J'];
let NM = { k4:'S', p1:'', ius:'', p2:'', v3:'' };   // Namen kommen verschlüsselt aus den Daten
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = p => String(p).toLowerCase().replace(/[^a-z0-9]/g, '');
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const store = {
  get(k = LS_KEY){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(v, k = LS_KEY){ try { localStorage.setItem(k, v); } catch(e){} },
  del(k = LS_KEY){ try { localStorage.removeItem(k); } catch(e){} }
};

const unlock = async pin => PlannerCore.expandRoot(await PlannerCore.decryptVault(VAULT, pin));

/* ================= Helfer ================= */
const isWE = d => d.w === 'Sa' || d.w === 'So';
const parse = s => { const [dd,mm,yy] = s.split('.').map(Number); return new Date(yy, mm-1, dd); };
const calcToday = () => { const t = new Date(); return [t.getDate(), t.getMonth()+1, t.getFullYear()].map((x,i) => i<2 ? String(x).padStart(2,'0') : x).join('.'); };
let todayStr = calcToday();
let PLANYEAR = 0;                                       // Jahr mit den meisten Tagen im Plan
const planYearOf = v => { const n = {}; v.days.forEach(d => { const y = +d.d.slice(6); n[y] = (n[y] || 0) + 1; }); return +Object.keys(n).sort((a, b) => n[b] - n[a])[0]; };
const kd = d => +d.d.slice(6) === PLANYEAR ? d.d.slice(0,6) : d.d.slice(0,6) + d.d.slice(8);
const rng = (D, a, b) => a === b ? `${D[a].w} ${kd(D[a])}` : `${D[a].w} ${kd(D[a])} – ${D[b].w} ${kd(D[b])}`;
const nameList = arr => arr.length === 3 ? KINDER.slice(0,2).join(', ') + ' & ' + KINDER[2] : arr.join(' & ');
const kurz = namen => namen.length === 1 ? namen[0] : namen.map(n => n[0]).join('+');
const bei = (d, c) => KINDER.filter((_,i) => d.k[i] === c);
const iusFree = d => !bei(d,'I').length && d.s === 'M' && (isWE(d) || d.h || /Urlaub |Silvester|Jahre /.test(d.a));

/* Farbe eines Tages – je Person die eine Frage, die zählt */
/* Umschalter für die beiden anderen Ansichten: hervorheben, wann die Kinder da sind ('da') oder wann man frei hat ('frei') */
let MODE = 'frei';
const MODE_DEFAULT = { v2:'frei', v3:'da' };
const modeKey = view => 'kinderplanung_modus_' + view;
/* Ansicht 6 (Kind 1) sieht dasselbe wie Ansicht 4 – gleiche Darstellung */
const vk = view => view === 'v6' ? 'v4' : view;
function dayClass(view, d){
  if (view === 'v3') return MODE === 'frei' ? (d.s === 'I' ? 'fr' : '') : (d.s === 'M' ? 'on' : '');
  if (view === 'v2'){
    const s = bei(d,'I').length, h = 3 - s;
    if (MODE === 'da') return h === 3 ? 'on' : h ? 'kid' : '';
    return s === 3 ? 'fr' : s ? 'pf' : '';
  }
  const nI = bei(d,'I').length;                          // 1–2 Kinder = Papa-Kind-Wochenende (eigene Farbe)
  if (vk(view) === 'v4') return nI === 3 ? 'kid' : nI ? 'pk' : '';
  if (view === 'v5') return d.s === 'M' ? 'on' : '';
  if (/Männerurlaub/.test(d.a) && !bei(d,'I').length) return 'mu';
  if (iusFree(d)) return 'fr';
  return nI === 3 ? 'kid' : nI ? 'pk' : '';
}
const LEGEND = () => ({
  v3:   MODE === 'frei' ? [['fr',`frei – ${NM.k4} bei ${NM.ius}`],['fe','Schulferien']] : [['on',`${NM.k4} bei dir`],['fe','Schulferien']],
  v2: MODE === 'da' ? [['on','Kinder bei dir'],['kid','einzelne Kinder bei dir'],['fe','Schulferien']]
                         : [['fr',`frei – Kinder bei ${NM.p1}`],['pf','teilweise frei'],['fe','Schulferien']],
  ius:     [['kid',`Kinder von ${NM.p1} da`],['pk','Papa-Kind-Wochenende (einzelne Kinder)'],['fr','frei – ohne Kinder'],['mu','Männerurlaub'],['fe','Schulferien']],
  v4:      [['kid',`Kinder von ${NM.p1} bei ${NM.ius}`],['pk','Papa-Kind-Wochenende (einzelne Kinder)'],['fe','Schulferien']],
  v5:      [['on',`du bist bei ${NM.v3}`],['fe','Schulferien']]
});
/* Legende einklappbar (Standard: zu); Zustand bleibt beim Blättern erhalten */
let LEG_OPEN = false;
const legendBox = inner => `<details class="legbox"${LEG_OPEN ? ' open' : ''}><summary>Legende</summary>${inner}</details>`;
document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('legbox')){ LEG_OPEN = e.target.open;
  document.querySelectorAll('.legbox').forEach(x => { if (x !== e.target && x.open !== LEG_OPEN) x.open = LEG_OPEN; }); } }, true);
const ICONS_HELP = '🎂 Geburtstag · 📌 Termin/Anlass · 🚗 Abholen/Bringen · rote Zahl = Feiertag';

/* Zeiträume (für die Liste unter dem Monat) */
function buildRuns(v){
  const D = v.days, out = [];
  const add = (test, label, cls) => {
    let i = 0;
    while (i < D.length){
      if (!test(D[i])){ i++; continue; }
      const key = label(D[i]); let j = i;
      while (j+1 < D.length && test(D[j+1]) && label(D[j+1]) === key) j++;
      out.push({ from:i, to:j, text:key, cls }); i = j+1;
    }
  };
  if (v.view === 'v3'){
    if (MODE === 'frei') add(d => d.s === 'I', () => `frei – ${NM.k4} bei ${NM.ius}`, 'fr');
    else add(d => d.s === 'M', () => `${NM.k4} bei dir`, 'on');
  } else if (v.view === 'v2' && MODE === 'da'){
    add(d => bei(d,'D').length === 3, () => 'Kinder bei dir', 'on');
    add(d => { const n = bei(d,'D').length; return n > 0 && n < 3; }, d => `${nameList(bei(d,'D'))} bei dir, ${nameList(bei(d,'I'))} bei ${NM.p1}`, 'kid');
  } else if (v.view === 'v2'){
    add(d => bei(d,'I').length === 3, () => `frei – Kinder bei ${NM.p1}`, 'fr');
    add(d => { const n = bei(d,'I').length; return n > 0 && n < 3; }, d => `${nameList(bei(d,'I'))} bei ${NM.p1}, ${nameList(bei(d,'D'))} bei dir`, 'pf');
  } else if (v.view === 'v5'){
    add(d => d.s === 'M', () => `Du bist bei ${NM.v3}`, 'on');
    add(d => bei(d,'I').length > 0, d => nameList(bei(d,'I')) + ' da', 'kid');
  } else if (vk(v.view) === 'v4'){
    add(d => bei(d,'I').length === 3, d => nameList(bei(d,'I')) + ` bei ${NM.ius}`, 'kid');
    add(d => { const n = bei(d,'I').length; return n > 0 && n < 3; }, d => nameList(bei(d,'I')) + ` bei ${NM.ius}`, 'pk');
    add(d => d.s === 'M', () => `${NM.k4} bei ${NM.v3}`, 'v3');
  } else {
    add(d => bei(d,'I').length === 3, () => 'AMJ bei euch', 'kid');
    add(d => { const n = bei(d,'I').length; return n > 0 && n < 3; }, d => nameList(bei(d,'I')) + ' bei euch', 'pk');
    add(d => d.s === 'M', () => `${NM.k4} bei ${NM.v3}`, 'v3');
    add(iusFree, () => 'frei – ohne Kinder', 'fr');
    add(d => /Männerurlaub/.test(d.a), () => `Männerurlaub ${NM.p1}`, 'mu');
  }
  return out.sort((a,b) => a.from - b.from || a.to - b.to);
}

/* ================= Was ist neu ================= */
/* Jeder Eintrag erscheint pro Gerät und Ansicht (PIN) genau so lange, bis „Gelesen“ geklickt wurde. */
const shortHash = s => { let h = 5381; for (const ch of String(s)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); };
const newsId = c => c.d + '#' + shortHash(c.text);                 // Q6: „gelesen“-Liste ohne Klartext
function seenSet(view){
  let ids = [];
  try { ids = JSON.parse(store.get('kinderplanung_gelesen_' + view) || '[]'); } catch(e){}
  ids = ids.map(x => { const i = String(x).indexOf('|'); return i > 0 ? x.slice(0, i) + '#' + shortHash(x.slice(i + 1)) : x; });   // alte Klartext-Einträge umwandeln
  const set = new Set(ids);
  const old = store.get('kinderplanung_gesehen_' + view);          // frühere Speicherart (Datum) übernehmen
  if (old) (V.changes || []).filter(c => c.iso <= old).forEach(c => set.add(newsId(c)));
  return set;
}
function renderNews(v){
  $('newsbox').innerHTML = '<div id="newsA"></div><div id="tageA"></div>';
  renderSystemNews(v);                            // „Geänderte Tage“ steht unter dem Kalender (renderMonth)
}
function renderSystemNews(v){
  const key = 'kinderplanung_gelesen_' + v.view, firstVisit = store.get(key) === null && store.get('kinderplanung_gesehen_' + v.view) === null;
  const seen = seenSet(v.view);
  const twoWeeksAgo = new Date(Date.now() - 14*864e5).toISOString().slice(0,10);
  const fresh = (v.changes || []).filter(c => !seen.has(newsId(c)) && (!firstVisit || c.iso >= twoWeeksAgo)).reverse();
  if (!fresh.length){ $('newsA').innerHTML = ''; return; }
  $('newsA').innerHTML = `<div class="news" id="news"><h3>Was ist neu? <span class="badge">${fresh.length}</span></h3>
    <ul>${fresh.map((c,i) => `<li class="${i >= 3 ? 'more' : ''}">${esc(c.text)} <small>(${esc(c.d)})</small></li>`).join('')}</ul>
    <div class="btns"><button class="btn pri" id="seen">Gelesen</button>${fresh.length > 3 ? `<button class="btn" id="morenews">${fresh.length - 3} weitere</button>` : ''}<button class="btn" id="allchanges">Alle Änderungen</button></div></div>`;
  $('seen').onclick = () => {
    (v.changes || []).forEach(c => seen.add(newsId(c)));             // alles bis jetzt gilt als gelesen
    store.set(JSON.stringify([...seen]), key); store.del('kinderplanung_gesehen_' + v.view);
    $('newsA').innerHTML = '';
  };
  if ($('morenews')) $('morenews').onclick = e => { $('news').classList.add('open'); e.target.remove(); };
  $('allchanges').onclick = () => showChanges(v);
}
/* Geänderte Tage (inhaltliche Änderungen, je Ansicht nur was sie sieht) – getrennt von „Was ist neu?“ (System) */
const tageKey = view => 'kinderplanung_tage_gelesen_' + view;
const deKey = s => s.split('.').reverse().join('');
function tageEintraege(v){
  const out = [];
  v.days.forEach((d, i) => (d.vl || []).forEach(([t, by, txt]) => out.push({ i, d, t, txt, id: shortHash(d.d + '|' + t + '|' + txt) })));
  return out.sort((a, b) => deKey(b.t).localeCompare(deKey(a.t)) || deKey(a.d.d).localeCompare(deKey(b.d.d)));
}
function tageGelesen(v){ store.set(JSON.stringify(tageEintraege(v).map(e => e.id)), tageKey(v.view)); }
function renderTage(v){
  const box = $('tageUnten'); if (!box) return;
  const raw = store.get(tageKey(v.view)), all = tageEintraege(v);
  let seen = new Set(); try { seen = new Set(JSON.parse(raw || '[]')); } catch(e){}
  if (raw === null){                                   // erster Besuch: nur die letzten 14 Tage zeigen
    const t = new Date(Date.now() - 14*864e5), grenze = `${t.getFullYear()}${String(t.getMonth()+1).padStart(2,'0')}${String(t.getDate()).padStart(2,'0')}`;
    all.filter(e => deKey(e.t) < grenze).forEach(e => seen.add(e.id));
  }
  const fresh = all.filter(e => !seen.has(e.id));
  if (!fresh.length){ box.innerHTML = ''; return; }
  box.innerHTML = `<div class="news" id="tage" style="margin-top:14px"><h3>Geänderte Tage <span class="badge">${fresh.length}</span></h3>
    <ul>${fresh.map((e, n) => `<li class="${n >= 3 ? 'more' : ''}"><a href="#" data-tag="${e.i}">${esc(e.d.w)} ${esc(e.d.d)}</a>: ${esc(e.txt)} <small>(geändert ${esc(e.t)})</small></li>`).join('')}</ul>
    <div class="btns"><button class="btn pri" id="tageseen">Gelesen</button>${fresh.length > 3 ? `<button class="btn" id="moretage">${fresh.length - 3} weitere</button>` : ''}</div></div>`;
  $('tageseen').onclick = () => { tageGelesen(v); box.innerHTML = ''; };
  if ($('moretage')) $('moretage').onclick = e => { $('tage').classList.add('open'); e.target.remove(); };
  box.querySelectorAll('[data-tag]').forEach(a => a.onclick = e => { e.preventDefault(); openDetail(+a.dataset.tag); });
}
function showChanges(v){
  const all = (v.changes || []).slice().reverse();
  const key = t => t.split('.').reverse().join('');
  const log = []; v.days.forEach(d => (d.vl || []).forEach(([t, by, txt]) => log.push({ t, by, txt, d })));
  log.sort((a, b) => key(b.t).localeCompare(key(a.t)) || key(a.d.d).localeCompare(key(b.d.d)));
  $('sheetcard').innerHTML = `<h3>Alle Änderungen</h3><div class="sub">Neueste zuerst</div>
    ${all.length ? `<ul class="changelist">${all.map(c => `<li>${esc(c.text)} <small>(${esc(c.d)})</small></li>`).join('')}</ul>` : '<p>Noch keine Änderungen.</p>'}
    <h4 style="margin:18px 0 4px">Verlauf: geänderte Tage</h4>
    <div class="sub" style="margin-bottom:6px">Wann welcher Tag von wem geändert wurde (seit 10.11.2026).</div>
    ${log.length ? `<div class="hist">${log.slice(0, 80).map(e => `<div class="hl"><span class="ht">${esc(e.t)}${e.by ? ' · ' + esc(e.by) : ''} · für ${esc(e.d.w)} ${esc(e.d.d)}</span>${esc(e.txt)}</div>`).join('')}</div>` : '<p class="small">Noch keine Einträge.</p>'}
    <button id="closesheet">Schließen</button>`;
  $('sheet').classList.remove('hidden'); $('closesheet').onclick = closeDetail;
}

/* ================= Monat ================= */
let MONTHS = [], MI = 0, RUNS = [];
function monthsOf(v){
  const g = [];
  v.days.forEach((d, i) => { const dt = parse(d.d), key = dt.getFullYear()*12 + dt.getMonth();
    if (!g.length || g[g.length-1].key !== key) g.push({ key, y:dt.getFullYear(), m:dt.getMonth(), from:i, to:i }); else g[g.length-1].to = i; });
  return g;
}
/* Termin/Anlass: alles außer Geburtstagen (eigenes Symbol) und gesetzlichen Feiertagen (rote Zahl) */
const isTermin = x => !/Geburtstag/.test(x) && !PlannerCore.FEIERTAGE.includes(x) && x !== 'Ostern';
const reiseZeichen = () => V && V.reiseIcon ? `<img src="${esc(V.reiseIcon)}" alt="Reise" style="height:1em;width:auto;vertical-align:-.12em">` : '✈️';
function icons(d){
  let s = '';
  if (/Geburtstag/.test(d.a)) s += '🎂';
  if (PlannerCore.parts(d.a).some(isTermin)) s += '📌';
  if (d.r) s += reiseZeichen();
  if (d.u && d.u.some(u => u[2] !== 'visit')) s += '🚗';
  else if (d.u) s += '👋';
  return s;
}
function renderMonth(){
  const v = V, D = v.days, g = MONTHS[MI];
  const first = new Date(g.y, g.m, 1), lead = (first.getDay() + 6) % 7;
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="mc blank"></div>';
  for (let day = 1; day <= g.to - g.from + 1; day++){   // Januar 2028 endet am 09.
    const idx = g.from + day - 1;
    const d = D[idx], cls = dayClass(v.view, d);
    let ks = '';
    if (v.view === 'ius' || vk(v.view) === 'v4' || v.view === 'v5') ks = `<span class="ks">${[0,1,2].map(i => `<b class="${d.k[i]==='I'?'a':'x'}">${KINDER[i][0]}</b>`).join('')}${v.view === 'v5' ? '' : `<b class="${d.s==='I'?'s':'x'}">S</b>`}</span>`;
    cells += `<div class="mc ${cls} ${d.f?'fe':''} ${d.h?'fei':''} ${d.d===todayStr?'today':''} ${editMark(idx)}" data-i="${idx}" title="${esc(d.a)}">
      <span class="n">${day}</span><span class="ic">${icons(d)}</span>${ks}</div>`;
  }
  // Unter dem Kalender: nur „Geänderte Tage“ (Entscheidung 27./28.11.2026; Zeiten, Abholen & Bringen, Termine stehen in Tagesdetails und Tabelle)
  $('month').innerHTML = `
    <div class="mhead"><button id="prevm" aria-label="Vorheriger Monat" ${MI===0?'disabled':''}>‹</button>
      <h2>${MONATE[g.m]} ${g.y}</h2>
      <button id="nextm" aria-label="Nächster Monat" ${MI===MONTHS.length-1?'disabled':''}>›</button></div>
    <div class="wdrow">${WDS.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="mgrid" id="mgrid">${cells}</div>
    ${legendBox(`<div class="legend">${LEGEND()[vk(v.view)].map(([c,t]) => `<span><i class="sw s-${c}"></i>${t}</span>`).join('')}
      ${v.view==='ius' || vk(v.view)==='v4' ? `<span><i class="sw" style="background:var(--kA)"></i>${KINDER.map(k => k[0]).join(' ')}</span><span><i class="sw" style="background:var(--kS)"></i>${NM.k4} da</span>` : ''}
      ${v.view==='v5' ? `<span><i class="sw" style="background:var(--kA)"></i>${KINDER.map(k => k[0]).join(' ')} = da</span>` : ''}</div>
    <div class="legend" style="margin-top:0">${ICONS_HELP}</div>`)}
    <div id="tageUnten"></div>
    ${v.contact ? `<div style="text-align:center;margin-top:14px"><button class="btn pri" data-req="${g.from}">✉️ Änderung anfragen</button></div>` : ''}
    <p class="hint">Tippe auf einen Tag für Details · Wischen oder ‹ › für andere Monate</p>`;
  renderTage(v);
  $('prevm').onclick = () => go(-1); $('nextm').onclick = () => go(1);
  let sx = null;
  $('mgrid').addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, {passive:true});
  $('mgrid').addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); sx = null; });
}
function go(step){ const n = MI + step; if (n < 0 || n >= MONTHS.length) return; MI = n; renderMonth(); }

/* ================= Jahr ================= */
function renderYear(){
  const v = V, D = v.days;
  $('year').innerHTML = `${legendBox(`<div class="legend">${LEGEND()[vk(v.view)].map(([c,t]) => `<span><i class="sw s-${c}"></i>${t}</span>`).join('')}<span>rote Zahl = Feiertag · unterstrichen = Geburtstag</span></div>`)}
    <div class="ygrid">${MONTHS.map((g, gi) => {
      const lead = (new Date(g.y, g.m, 1).getDay() + 6) % 7;
      let c = ''; for (let i = 0; i < lead; i++) c += '<span class="yc blank"></span>';
      for (let i = g.from; i <= g.to; i++){ const d = D[i];
        c += `<span class="yc ${dayClass(v.view, d)} ${d.f?'fe':''} ${d.h?'fei':''} ${/Geburtstag/.test(d.a)?'bd':''}">${parseInt(d.d)}</span>`; }
      return `<div class="ym" data-gm="${gi}"><h4>${MONATE[g.m]} ${g.y}</h4><div class="yg">${WDS.map(w => `<span class="yc blank" style="color:var(--muted)">${w[0]}</span>`).join('')}${c}</div></div>`;
    }).join('')}</div>
    <p class="hint">Tippe auf einen Monat, um ihn groß zu öffnen.</p>`;
}

/* ================= Tabelle (bisheriger Jahresplan) ================= */
const COLS = () => ({
  ius: [
    { head:'AMJ', cell(d){
        if (d.k === 'III') return ['AMJ','amj'];
        const b = bei(d,'I');
        if (b.length) return [kurz(b), 'pk'];
        if (/Männerurlaub/.test(d.a)) return ['Männerurl.','mu'];
        if (isWE(d) || d.h || /Urlaub |Silvester|Jahre /.test(d.a)) return ['IuS','ius'];
        return ['', 'none'];
      } },
    { head:NM.k4, cell: d => d.s === 'I' ? ['IuS','k4'] : [NM.v3[0],'v3'] }
  ],
  v2: [ { head:'Kinder', cell(d){ if (d.k === 'DDD') return ['AMJ','amj']; const b = bei(d,'D'); return b.length ? [kurz(b), 'part'] : ['', 'none']; } } ],
  v3: [ { head:NM.k4, cell: d => d.s === 'M' ? [NM.k4,'amj'] : ['', 'none'] } ],
  v4: [ { head:'AMJ', cell(d){ const b = bei(d,'I'); return b.length === 3 ? ['AMJ','amj'] : b.length ? [kurz(b), 'pk'] : ['', 'none']; } },
        { head:NM.k4, cell: d => d.s === 'I' ? [NM.k4[0],'k4'] : [NM.v3[0],'v3'] } ],
  v5: [ { head:'Du', cell: d => d.s === 'M' ? [NM.v3,'amj'] : ['', 'none'] },
        { head:'AMJ', cell(d){ const b = bei(d,'I'); return b.length === 3 ? ['AMJ','part'] : b.length ? [kurz(b), 'part'] : ['', 'none']; } } ]
});
const TLEGEND = () => ({
  ius: [['AMJ','amj','alle drei bei uns'],[KINDER[2],'pk','Papa-Kind-Wochenende'],['IuS','ius',`${NM.ius} ohne Kinder`],
        ['','mu',`Männerurlaub ${NM.p1}`],['IuS','k4',`${NM.k4} bei uns`],[NM.v3[0],'v3',`${NM.k4} bei ${NM.v3}`],['','ferien','Schulferien']],
  v2: [['AMJ','amj',`${KINDER.join(', ')} bei ${NM.p2}`],[KINDER[2],'part','nur einzelne Kinder'],['','ferien','Schulferien']],
  v3: [[NM.k4,'amj',`${NM.k4} bei ${NM.v3}`],['','ferien','Schulferien']],
  v5: [[NM.v3,'amj',`du bist bei ${NM.v3}`],['AMJ','part',`${KINDER.join(', ')} da`],['','ferien','Schulferien']],
  v4: [['AMJ','amj',`alle drei bei ${NM.ius}`],[KINDER[2],'pk','Papa-Kind-Wochenende'],[NM.k4[0],'k4',`${NM.k4} bei ${NM.ius}`],[NM.v3[0],'v3',`${NM.k4} bei ${NM.v3}`],['','ferien','Schulferien']]
});
function renderTable(v){
  $('tlegend').innerHTML = legendBox(`<div class="tleg">${TLEGEND()[vk(v.view)].map(([t,c,txt]) =>
    `<span><i class="tsw ${c==='ferien' ? '' : 'c-'+c}" style="${c==='ferien' ? 'background:var(--ferien)' : ''}">${esc(t)}</i>${esc(txt)}</span>`).join('')}</div>`);
  const tmpl = `2.1rem 1.7rem ${'4.1rem '.repeat(COLS()[vk(v.view)].length)}1fr`;
  const nowKey = new Date().getFullYear()*12 + new Date().getMonth();
  $('monthnav').innerHTML = MONTHS.map(g =>
    `<button data-m="m${g.key}" class="${g.key===nowKey?'now':''}">${MON_KURZ[g.m]}${g.y!==PLANYEAR ? ' '+String(g.y).slice(2) : ''}</button>`).join('');
  $('grid').innerHTML = MONTHS.map(g => {
    const idx = []; for (let i = g.from; i <= g.to; i++) idx.push(i);
    return `<article class="month" id="m${g.key}">
      <h3>${MONATE[g.m]} ${g.y}<small>${idx.length < 28 ? 'bis ' + v.days[g.to].d.slice(0,6) : ''}</small></h3>
      <div class="colhead" style="grid-template-columns:${tmpl}"><span>Tag</span><span></span>${COLS()[vk(v.view)].map(c => `<span>${c.head}</span>`).join('')}<span>Anlass</span></div>
      ${idx.map(i => { const d = v.days[i]; return `
        <div class="row ${isWE(d)?'we':''} ${d.d===todayStr?'today':''} ${editMark(i)}" data-i="${i}" style="grid-template-columns:${tmpl}">
          <span class="dn ${d.f?'fe':''} ${d.h?'fei':''}">${parseInt(d.d)}</span><span class="wt">${d.w}</span>
          ${COLS()[vk(v.view)].map(c => { const [t,cl] = c.cell(d); return `<span class="cell c-${cl}">${esc(t)}</span>`; }).join('')}
          <span class="an">${d.c ? '<i class="dot"></i>' : ''}${esc(d.a)}</span></div>`; }).join('')}
    </article>`; }).join('');
}

/* ================= Tagesdetails ================= */
function detailRows(v, d){
  if (v.view === 'ius') return [...KINDER.map((n,i) => [n, d.k[i] === 'I' ? 'bei uns' : `bei ${NM.p2}`]), [NM.k4, d.s === 'I' ? 'bei uns' : `bei ${NM.v3}`]];
  if (v.view === 'v2') return KINDER.map((n,i) => [n, d.k[i] === 'D' ? 'bei dir' : `bei ${NM.p1}`]);
  if (v.view === 'v5') return [['Du', d.s === 'M' ? `bei ${NM.v3}` : `bei ${NM.ius}`], ...KINDER.map((n,i) => [n, d.k[i] === 'I' ? 'da' : `bei ${NM.p2}`])];
  if (vk(v.view) === 'v4') return [...KINDER.map((n,i) => [n, d.k[i] === 'I' ? `bei ${NM.ius}` : `bei ${NM.p2}`]), [NM.k4, d.s === 'I' ? `bei ${NM.ius}` : `bei ${NM.v3}`]];
  return [[NM.k4, d.s === 'M' ? 'bei dir' : `bei ${NM.ius}`]];
}
/* Verlauf eines Tages: wann, wer, was (nur, was diese Ansicht sehen darf) */
const histBlock = d => !d.vl ? '<p class="small" style="margin-top:12px">Verlauf: seit 10.11.2026 nicht geändert.</p>'
  : `<div class="hist"><h4>Verlauf</h4>${d.vl.map(([t, by, txt]) => `<div class="hl"><span class="ht">${esc(t)}${by ? ' · ' + esc(by) : ''}</span>${esc(txt)}</div>`).join('')}</div>`;
function openDetail(i){
  const d = V.days[i];
  $('sheetcard').innerHTML = `
    <h3>${d.w}, ${esc(d.d)}</h3>
    <div class="sub">KW ${d.kw}${d.f ? ' · Schulferien' : ''}${d.h ? ' · Feiertag' : ''}</div>
    <div class="kv">${detailRows(V, d).map(([k,val]) => `<span class="k">${esc(k)}</span><span>${esc(val)}</span>`).join('')}</div>
    ${d.u ? `<div class="kv">${d.u.map(u => `<span class="k">${u[0] ? esc(u[0]) : 'Übergabe'}</span><span>${esc(u[1])}</span>`).join('')}</div>` : ''}
    ${d.r ? `<div class="kv">${d.r.map(r => `<span class="k">${reiseZeichen()} ${esc(r[0])}</span><span>${esc(r[1])}</span>`).join('')}</div>` : ''}
    ${d.a ? `<div class="kv"><span class="k">Anlass</span><span>${esc(d.a)}</span></div>` : ''}
    ${d.c ? `<div class="note">${esc(d.c)}</div>` : ''}
    ${histBlock(d)}
    ${V.contact ? `<button class="btn pri" style="width:100%;margin-top:14px;padding:11px" data-req="${i}">✉️ Änderung anfragen</button>` : ''}
    <button id="closesheet">Schließen</button>`;
  $('sheet').classList.remove('hidden');
  $('closesheet').onclick = closeDetail;
}
function closeDetail(){ $('sheet').classList.add('hidden'); }

/* ================= PDF-Export: 2 Seiten A4 quer, ohne externe Bibliothek ================= */
const PDF_MAP = {'–':'\x96','—':'\x97','…':'\x85','„':'\x84','“':'\x93','”':'\x94','‚':'\x82','‘':'\x91','’':'\x92','€':'\x80'};
const pdfStr = s => [...String(s)].map(c => PDF_MAP[c] || (c.charCodeAt(0) < 256 ? c : '?')).join('').replace(/[\\()]/g, m => '\\' + m);
function textW(s, size, bold){
  let w = 0;
  for (const c of String(s)){
    if ('il.,:;|!\''.includes(c)) w += 230;
    else if ('fjtrI()- '.includes(c)) w += 300;
    else if ('MWmw'.includes(c)) w += 830;
    else if ((c >= 'A' && c <= 'Z') || 'ÄÖÜ&'.includes(c)) w += 680;
    else w += 556;
  }
  return w * size / 1000 * (bold ? 1.06 : 1);
}
const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const PC = { amj:rgb('#a3d68c'), part:rgb('#d9efc9'), pk:rgb('#f6cde0'), ius:rgb('#d3c0ee'), pf:rgb('#ece4f8'), mu:rgb('#a9e2db'), k4:rgb('#c3dcf6'),
  v3:rgb('#f7c792'), fe:rgb('#fff0a3'), ink:rgb('#26241f'), grey:rgb('#7a756b'), line:rgb('#d9d3c7'), we:rgb('#f3f0e9'), red:rgb('#c2452d'), white:[1,1,1] };
function pdfCanvas(H){
  const ops = [], f = n => n.toFixed(2), c = a => a.map(x => x.toFixed(3)).join(' ');
  return { ops,
    rect(x, y, w, h, fill, stroke){
      if (fill) ops.push(`${c(fill)} rg ${f(x)} ${f(H-y-h)} ${f(w)} ${f(h)} re f`);
      if (stroke) ops.push(`${c(stroke)} RG 0.5 w ${f(x)} ${f(H-y-h)} ${f(w)} ${f(h)} re S`);
    },
    text(x, y, s, size, o = {}){
      s = String(s ?? ''); if (!s) return;
      const bold = !!o.bold;
      if (o.maxW && textW(s, size, bold) > o.maxW){ while (s.length > 1 && textW(s + '…', size, bold) > o.maxW) s = s.slice(0, -1); s = s.trimEnd() + '…'; }
      const w = textW(s, size, bold), X = o.align === 'center' ? x - w/2 : o.align === 'right' ? x - w : x;
      ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${c(o.color || PC.ink)} rg ${f(X)} ${f(H-y)} Td (${pdfStr(s)}) Tj ET`);
    } };
}
function pdfBytes(pages, W, H){
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const kids = []; let n = 5;
  pages.forEach(ops => {
    const content = ops.join('\n'), pi = n++, ci = n++;
    kids.push(`${pi} 0 R`);
    objs[pi] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${ci} 0 R >>`;
    objs[ci] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
  for (let i = 1; i < objs.length; i++){ offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}
/* Spalten je Ansicht: [Breite, Tag → [Text, Farbe]] */
function pdfCols(view){
  const ini = arr => arr.map(n => n[0]).join('');
  if (vk(view) === 'v4') return [
    [22, d => { const b = bei(d,'I'); return b.length === 3 ? ['AMJ', PC.amj] : b.length ? [ini(b), PC.pk] : ['', null]; }],
    [11, d => d.s === 'I' ? [NM.k4[0], PC.k4] : [NM.v3[0], PC.v3]]];
  if (view === 'v3') return [[22, MODE === 'frei' ? (d => d.s === 'I' ? ['frei', PC.ius] : ['', null]) : (d => d.s === 'M' ? [NM.k4, PC.amj] : ['', null])]];
  if (view === 'v2') return [[22, MODE === 'da'
    ? (d => { const h = bei(d,'D'); return h.length === 3 ? ['da', PC.amj] : h.length ? [ini(h), PC.part] : ['', null]; })
    : (d => { const s = bei(d,'I'); return s.length === 3 ? ['frei', PC.ius] : s.length ? [ini(s), PC.pf] : ['', null]; })]];
  return [
    [22, d => { const b = bei(d,'I');
      if (b.length === 3) return ['AMJ', PC.amj];
      if (b.length) return [ini(b), PC.pk];
      if (/Männerurlaub/.test(d.a)) return ['MU', PC.mu];
      if (iusFree(d)) return ['IuS', PC.ius];
      return ['', null]; }],
    [11, d => d.s === 'I' ? [NM.k4[0], PC.k4] : [NM.v3[0], PC.v3]]
  ];
}
function pdfLegend(view){
  if (vk(view) === 'v4') return [[PC.amj, `AMJ = alle drei bei ${NM.ius}`], [PC.pk, 'Papa-Kind-WE (nur diese Kinder)'], [PC.k4, `${NM.k4[0]} = ${NM.k4} bei ${NM.ius}`], [PC.v3, `${NM.v3[0]} = ${NM.k4} bei ${NM.v3}`]];
  if (view === 'v3') return MODE === 'frei' ? [[PC.ius, `frei = ${NM.k4} bei ${NM.ius}`]] : [[PC.amj, `${NM.k4} = ${NM.k4} bei dir`]];
  if (view === 'v2') return MODE === 'da' ? [[PC.amj, 'da = alle drei bei dir'], [PC.part, 'Buchstaben = nur diese Kinder bei dir']]
    : [[PC.ius, `frei = Kinder bei ${NM.p1}`], [PC.pf, `Buchstaben = nur diese Kinder bei ${NM.p1}`]];
  return [[PC.amj, 'AMJ = alle drei da'], [PC.pk, 'Papa-Kind-WE (nur diese Kinder)'], [PC.ius, 'IuS = ohne Kinder'], [PC.mu, 'MU = Männerurlaub'],
          [PC.k4, `${NM.k4[0]} = ${NM.k4} da`], [PC.v3, `${NM.v3[0]} = ${NM.k4} bei ${NM.v3}`]];
}
function buildPdf(v){
  const W = 842, H = 595, M = 22, top = 46, headH = 15, legendH = 22, D = v.days;
  // Seiten: Monate vor dem Planjahr nur, solange sie noch nicht vorbei sind; dann Jan–Jun und Jul–Dez (+ Rest)
  const pre = MONTHS.filter(g => g.y < PLANYEAR), main = MONTHS.filter(g => g.y >= PLANYEAR);
  const preCurrent = pre.length && parse(D[pre[pre.length - 1].to].d) >= new Date(new Date().toDateString());
  const groups = [...(preCurrent ? [pre] : []), main.slice(0, 6), main.slice(6)];
  const rowH = (H - top - headH - legendH - M) / 31;
  const cols = pdfCols(v.view);
  const pages = groups.map((ms, pi) => {
    const n = Math.max(ms.length, 6), p = pdfCanvas(H), gap = 6, bw = (W - 2*M - gap*(n - 1)) / n;
    p.text(M, 28, `Kinderplanung ${ms[0].y} – ${v.label}`, 14, { bold:true });
    p.text(W - M, 28, `Stand ${v.stand} · Seite ${pi + 1} von ${groups.length}`, 8.5, { align:'right', color:PC.grey });
    ms.forEach((g, mi) => {
      const x0 = M + mi * (bw + gap), rows = g.to - g.from + 1;
      p.rect(x0, top, bw, headH, PC.ink);
      p.text(x0 + 5, top + 10.6, `${MONATE[g.m]} ${g.y}`, 8.5, { bold:true, color:PC.white });
      for (let i = g.from; i <= g.to; i++){
        const d = D[i], y = top + headH + (i - g.from) * rowH, base = y + rowH * 0.7;
        if (isWE(d)) p.rect(x0, y, bw, rowH, PC.we);
        if (d.f) p.rect(x0 + 1, y + 0.8, 13, rowH - 1.6, PC.fe);
        p.text(x0 + 13, base, parseInt(d.d), 7, { bold:true, align:'right', color: d.h ? PC.red : PC.ink });
        p.text(x0 + 16, base, d.w, 6.3, { color:PC.grey });
        let cx = x0 + 28;
        for (const [cw, fn] of cols){
          const [t, fill] = fn(d);
          if (fill) p.rect(cx, y + 1, cw, rowH - 2, fill);
          if (t) p.text(cx + cw/2, base, t, 6.3, { bold:true, align:'center' });
          cx += cw + 1.5;
        }
        p.text(cx + 1, base, d.a, 5.9, { maxW: x0 + bw - cx - 3, color: PC.ink });
        if (i < g.to) p.rect(x0, y + rowH - 0.25, bw, 0.25, PC.line);
      }
      p.rect(x0, top, bw, headH + rows * rowH, null, PC.line);
    });
    // Legende
    let lx = M; const ly = H - M - 6;
    const items = [...pdfLegend(v.view), [PC.fe, 'Schulferien'], [PC.we, 'Wochenende']];
    for (const [col, txt] of items){ p.rect(lx, ly - 7, 10, 9, col, PC.line); p.text(lx + 13, ly, txt, 7, { color:PC.grey }); lx += 13 + textW(txt, 7) + 14; }
    p.text(lx, ly, 'Rote Zahl = Feiertag', 7, { color:PC.red });
    return p.ops;
  });
  return pdfBytes(pages, W, H);
}
/* Jahresplan Jan–Dez auf einer Seite (A4 quer): nur Farben und Buchstaben, keine Anlässe */
function buildYearPdf(v){
  const W = 842, H = 595, M = 20, top = 44, headH = 14, legendH = 22, D = v.days;
  const ms = MONTHS.filter(g => g.y === PLANYEAR);
  const gap = 3, bw = (W - 2*M - gap*11) / 12, rowH = (H - top - headH - legendH - M) / 31;
  const cols = pdfCols(v.view), sum = cols.reduce((t, c) => t + c[0], 0);
  const p = pdfCanvas(H);
  p.text(M, 28, `Kinderplanung ${PLANYEAR} – ${v.label}`, 14, { bold:true });
  p.text(W - M, 28, `Stand ${v.stand}`, 8.5, { align:'right', color:PC.grey });
  ms.forEach((g, mi) => {
    const x0 = M + mi * (bw + gap), rows = g.to - g.from + 1;
    p.rect(x0, top, bw, headH, PC.ink);
    p.text(x0 + bw/2, top + 9.8, MONATE[g.m], 7.5, { bold:true, align:'center', color:PC.white });
    const cx0 = x0 + 21.5, avail = bw - 22.5 - 1.5 * (cols.length - 1);
    for (let i = g.from; i <= g.to; i++){
      const d = D[i], y = top + headH + (i - g.from) * rowH, base = y + rowH * 0.68;
      if (isWE(d)) p.rect(x0, y, bw, rowH, PC.we);
      if (d.f) p.rect(x0 + 1, y + 0.8, 10.5, rowH - 1.6, PC.fe);
      p.text(x0 + 10.5, base, parseInt(d.d), 6.3, { bold:true, align:'right', color: d.h ? PC.red : PC.ink });
      p.text(x0 + 12, base, d.w, 5.2, { color:PC.grey });
      let cx = cx0;
      for (const [w, fn] of cols){
        const cw = w / sum * avail, [t, fill] = fn(d);
        if (fill) p.rect(cx, y + 0.8, cw, rowH - 1.6, fill);
        if (t) p.text(cx + cw/2, base, t, 5.8, { bold:true, align:'center', maxW: cw - 1 });
        cx += cw + 1.5;
      }
      if (i < g.to) p.rect(x0, y + rowH - 0.25, bw, 0.25, PC.line);
    }
    p.rect(x0, top, bw, headH + rows * rowH, null, PC.line);
  });
  let lx = M; const ly = H - M - 6;
  const items = [...pdfLegend(v.view), [PC.fe, 'Schulferien'], [PC.we, 'Wochenende']];
  for (const [col, txt] of items){ p.rect(lx, ly - 7, 10, 9, col, PC.line); p.text(lx + 13, ly, txt, 7, { color:PC.grey }); lx += 13 + textW(txt, 7) + 14; }
  p.text(lx, ly, 'Rote Zahl = Feiertag', 7, { color:PC.red });
  return pdfBytes([p.ops], W, H);
}
/* PDF einer bestimmten Ansicht (mit deren Standard-Hervorhebung, wenn nicht die eigene); kind: 'full' (2 Seiten) oder 'year' (1 Seite) */
const PDFKIND_KEY = 'kinderplanung_pdfart';
let PDF_KIND = (() => { const k = store.get(PDFKIND_KEY); return k === 'year' ? 'year' : 'full'; })();
function pdfFile(v, kind = 'full'){
  const keep = MODE;
  if (v !== V && MODE_DEFAULT[v.view]) MODE = MODE_DEFAULT[v.view];
  try {
    const bytes = kind === 'year' ? buildYearPdf(v) : buildPdf(v);
    return new File([bytes], `Kinderplanung_${v.label.replace(/[^A-Za-z0-9]+/g, '_')}${kind === 'year' ? '_' + PLANYEAR + '_Jahr' : ''}.pdf`, { type:'application/pdf' });
  }
  finally { MODE = keep; }
}
function saveFile(file){
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function sharePdf(v, kind = 'full'){
  const file = pdfFile(v, kind);
  const text = `Hallo ${v.label}, anbei der aktuelle Stand der Kinderplanung (Stand ${v.stand}).`;
  if (navigator.canShare && navigator.canShare({ files: [file] })){
    try { await navigator.share({ files: [file], title: 'Kinderplanung', text }); return; }
    catch(e){ if (e && e.name === 'AbortError') return; }
  }
  // Ausweichweg: PDF speichern und Mailprogramm mit vorbereitetem Text öffnen
  saveFile(file);
  toast('PDF gespeichert – bitte in der E-Mail als Anhang hinzufügen.');
  setTimeout(() => { location.href = `mailto:?subject=${encodeURIComponent('Kinderplanung – aktueller Stand ' + v.stand)}&body=${encodeURIComponent(text + '\n\n(PDF im Anhang)')}`; }, 400);
}
function downloadPdf(){
  if (!V) return;
  const isRoot = V === ROOT && ROOT.others;
  const draftNote = isRoot && CHG.size ? '<p class="small" style="color:#a35400">Hinweis: Die PDFs enthalten nur den veröffentlichten Stand, nicht euren offenen Entwurf.</p>' : '';
  let who;
  if (isRoot){
    const pub = PUB ? PlannerCore.deriveViews(PUB) : { ius: ROOT, ...ROOT.others };   // nie den Entwurf verschicken
    who = [['ius', pub.ius, NM.ius], ['v2', pub.v2, NM.p2], ['v3', pub.v3, NM.v3], ...(pub.v6 ? [['v6', pub.v6, pub.v6.label]] : [])];
  } else who = [[V.view, V, V.label]];
  const info = { full: 'Alle Monate mit Anlässen, je Halbjahr eine Seite.', year: `Januar bis Dezember ${PLANYEAR} auf einer Seite – nur Farben und Buchstaben, ohne Anlässe. Am besten farbig drucken.` };
  $('sheetcard').innerHTML = `<h3>PDF</h3><div class="sub">Zum Drucken oder Verschicken${isRoot ? ' – jeweils nur mit dem, was die Person sehen soll' : ''}.</div>
    <div class="seg" id="pdfkind"><button data-kind="full">Ausführlich (mit Anlässen)</button><button data-kind="year">Jahr auf 1 Seite</button></div>
    <p class="small" id="pdfinfo"></p>
    ${who.map(([k, v, n]) => `<div class="pdfrow"><b>${esc(n)}</b><span>
      <button class="btn${isRoot ? '' : ' pri'}" data-pdf="${k}" data-how="dl">Herunterladen</button>
      ${isRoot && k !== 'ius' ? `<button class="btn pri" data-pdf="${k}" data-how="share">Per Mail / WhatsApp senden</button>` : ''}</span></div>`).join('')}
    ${draftNote}
    ${isRoot ? '<p class="small">„Senden“ öffnet am Handy das Teilen-Menü (Mail, WhatsApp …) mit dem PDF als Anhang. Am Computer wird das PDF gespeichert und das Mailprogramm geöffnet – dort das PDF anhängen.</p>' : ''}
    <button id="closesheet">Schließen</button>`;
  $('sheet').classList.remove('hidden'); $('closesheet').onclick = closeDetail;
  const setKind = k => { PDF_KIND = k; store.set(k, PDFKIND_KEY);
    $('pdfkind').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.kind === k)); $('pdfinfo').textContent = info[k]; };
  $('pdfkind').querySelectorAll('button').forEach(b => b.onclick = () => setKind(b.dataset.kind));
  setKind(PDF_KIND);
  $('sheetcard').querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => {
    const v = who.find(w => w[0] === b.dataset.pdf)[1];
    if (b.dataset.how === 'share') sharePdf(v, PDF_KIND); else saveFile(pdfFile(v, PDF_KIND));
  });
}


/* ================= Laden & Bearbeiten (nur Hauptansicht) ================= */
// TOKEN_KEY: GitHub-Zugang nur noch für die Kalender-Gists (K1). AUTH_KEY: Anmeldung am Server (S2, 90 Tage).
// OWN_KEY wird nicht mehr benutzt (15-Minuten-Regel entfällt), aber beim vollständigen Abmelden noch gelöscht.
const OWN_KEY = 'kinderplanung_eigenstand', CACHE_KEY = 'kinderplanung_cache', DRAFT_KEY = 'kinderplanung_entwurf', TOKEN_KEY = 'kinderplanung_schreibzugang', TOKEN_EXP_KEY = 'kinderplanung_zugang_bis', AUTH_KEY = 'kinderplanung_anmeldung';
/* Hinweis, wenn der Kalender-Zugang bald abläuft (N5) */
function tokenWarning(){
  const exp = store.get(TOKEN_EXP_KEY);
  if (!exp || !store.get(TOKEN_KEY)) return '';
  const days = Math.round((new Date(exp) - new Date()) / 864e5);
  if (days > 30) return '';
  return days < 0 ? 'Der Kalender-Zugang auf diesem Gerät ist abgelaufen – bitte bei GitHub neu erzeugen.'
                  : `Der Kalender-Zugang auf diesem Gerät läuft in ${days} Tagen ab – bitte rechtzeitig bei GitHub verlängern („Regenerate token“).`;
}
/* Anmeldung am Server: gültig, solange noch mindestens eine Minute übrig ist */
function getAuth(){
  try { const a = JSON.parse(store.get(AUTH_KEY) || 'null'); return a && a.token && a.exp > Date.now() + 60e3 ? a : null; } catch(e){ return null; }
}
let OFFLINE = false;
async function loadVault(){
  let cached = null;
  try { cached = JSON.parse(store.get(CACHE_KEY) || 'null'); } catch(e){}
  let v;
  try { v = await PlannerCore.serverLoad(sfetch, SERVER, PLAN_ID); }
  catch(e){
    if (cached && cached.blobs){ OFFLINE = true; return cached; }   // ohne Server: zuletzt geladenen Stand verwenden
    throw e;
  }
  store.set(JSON.stringify(v), CACHE_KEY);
  return v;
}
const clone = o => JSON.parse(JSON.stringify(o));
const todayDE = () => new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
let EDIT = false, SEL = null, SELSTEP = 0, PUB = null, DRAFT = null, CHG = new Set(), NOTICE = '';

function initEdit(v){
  if (!v.master){ PUB = DRAFT = null; return; }
  PUB = clone(v.master); DRAFT = clone(v.master); NOTICE = '';
  try {
    const d = JSON.parse(store.get(DRAFT_KEY) || 'null');
    if (d && d.rows){
      let n = 0;
      DRAFT.rows.forEach((r, i) => { const x = d.rows[r.d]; if (x){ DRAFT.rows[i] = { ...r, ...x, d: r.d }; n++; } });
      if (n && d.rev !== VAULT.rev) NOTICE = 'Der Plan wurde inzwischen geändert. Dein Entwurf wurde auf den neuen Stand übertragen – bitte kurz prüfen.';
    }
  } catch(e){}
  applyDraft(false);
}
function rowEq(a, b){ return a.k === b.k && a.s === b.s && (a.a || '') === (b.a || '') && (a.c || '') === (b.c || '') && !!a.f === !!b.f; }
function applyDraft(save = true){
  CHG = new Set();
  const rows = {};
  DRAFT.rows.forEach((r, i) => { if (!rowEq(r, PUB.rows[i])){ CHG.add(i); rows[r.d] = { f:r.f, k:r.k, s:r.s, a:r.a || '', c:r.c || '' }; } });
  if (save){ if (CHG.size) store.set(JSON.stringify({ rev: VAULT.rev, rows }), DRAFT_KEY); else store.del(DRAFT_KEY); }
  const vs = PlannerCore.deriveViews({ ...DRAFT, stand: PUB.stand, changes: PUB.changes });
  const keys = ROOT.keys, master = ROOT.master;
  Object.assign(ROOT, vs.ius, { master, keys });
}
const editMark = i => (V !== ROOT || (!EDIT && !CHG.size)) ? '' : `${CHG.has(i) ? 'chg' : ''} ${EDIT && SEL && i >= SEL[0] && i <= SEL[1] ? 'sel' : ''}`;

function selectDay(i){
  if (!SEL || SELSTEP === 2){ SEL = [i, i]; SELSTEP = 1; }
  else { SEL = [Math.min(SEL[0], i), Math.max(SEL[0], i)]; SELSTEP = 2; }
  renderMonth(); renderTable(V); renderEditBar();
}
function renderEditBar(){
  const show = ROOT && ROOT.master && V === ROOT && (EDIT || CHG.size);
  $('editbar').classList.toggle('hidden', !show); document.body.classList.toggle('withbar', !!show);
  if (!show) return;
  const D = V.days; let h = '';
  if (NOTICE) h += `<div class="ln small" style="color:#a35400">${esc(NOTICE)}</div>`;
  if (EDIT){
    h += SEL ? `<div class="ln"><span class="grow"><b>${rng(D, SEL[0], SEL[1])}</b> · ${SEL[1]-SEL[0]+1} ${SEL[1]===SEL[0] ? 'Tag' : 'Tage'}${SELSTEP === 1 ? '<br><span class="small">Für einen Zeitraum noch auf den letzten Tag tippen.</span>' : ''}</span>
        <button class="btn pri" data-act="edit">Ändern</button><button class="btn" data-act="clearsel">Aufheben</button></div>`
      : `<div class="ln"><span class="grow">Tippe auf einen Tag – für einen Zeitraum auf den ersten und dann auf den letzten Tag (auch über Monate hinweg).</span><button class="btn" data-act="done">Fertig</button></div>`;
  }
  if (CHG.size) h += `<div class="ln"><span class="grow draft">${CHG.size} ${CHG.size === 1 ? 'Tag' : 'Tage'} geändert – noch nicht veröffentlicht</span>
      <button class="btn pri" data-act="publish">Veröffentlichen</button><button class="btn" data-act="discard">Verwerfen</button>${!EDIT ? '<button class="btn" data-act="startedit">Weiter bearbeiten</button>' : ''}</div>`;
  $('editbarin').innerHTML = h;
}
function editAction(a){
  if (a === 'clearsel'){ SEL = null; SELSTEP = 0; renderMonth(); renderTable(V); renderEditBar(); }
  else if (a === 'done'){ EDIT = false; SEL = null; render(ROOT, true); }
  else if (a === 'startedit'){ EDIT = true; setTab('month'); render(ROOT, true); }
  else if (a === 'edit') openEditSheet();
  else if (a === 'discard'){
    $('sheetcard').innerHTML = `<h3>Entwurf verwerfen?</h3><p>Alle ${CHG.size} noch nicht veröffentlichten Änderungen gehen verloren.</p>
      <div class="sheetbtns"><button class="btn pri" data-act="discardyes">Ja, verwerfen</button><button class="btn" data-act="close">Abbrechen</button></div>`;
    $('sheet').classList.remove('hidden');
  }
  else if (a === 'discardyes'){ DRAFT = clone(PUB); NOTICE = ''; applyDraft(); closeDetail(); render(ROOT, true); }
  else if (a === 'close') closeDetail();
  else if (a === 'publish') openPublishSheet();
  else if (a === 'token') openTokenSheet(false);
  else if (a === 'login') openLoginSheet(CHG.size > 0);
  else if (a === 'reload') location.reload();
}

/* --- Formular für Tag/Zeitraum --- */
let FORM = null;
function openEditSheet(){
  const [a, b] = SEL, rows = DRAFT.rows.slice(a, b + 1), single = a === b, D = V.days;
  const same = f => rows.every(r => f(r) === f(rows[0])) ? f(rows[0]) : null;
  FORM = { k: [0,1,2].map(j => same(r => r.k[j])), s: same(r => r.s) };
  const opt = (field, j, vals) => `<span class="opt" data-field="${field}" data-j="${j}">${vals.map(([v, t]) =>
      `<button type="button" data-v="${v}" class="${(field === 's' ? FORM.s : FORM.k[j]) === v ? 'on' : ''}">${esc(t)}</button>`).join('')}</span>
      ${(field === 's' ? FORM.s : FORM.k[j]) === null ? '<span class="mixed">unterschiedlich</span>' : ''}`;
  $('sheetcard').innerHTML = `<h3>${single ? `${D[a].w}, ${esc(D[a].d)}` : rng(D, a, b)}</h3>
    <div class="sub">${single ? 'Einen Tag ändern' : `${b - a + 1} Tage gemeinsam ändern`}</div>
    <div class="ef">
      <div class="quick"><button type="button" class="btn" data-quick="I">Alle drei bei uns</button><button type="button" class="btn" data-quick="D">Alle drei bei ${esc(NM.p2)}</button></div>
      ${KINDER.map((n, j) => `<div class="er"><span class="k">${esc(n)}</span><span>${opt('k', j, [['I','bei uns'], ['D','bei ' + NM.p2]])}</span></div>`).join('')}
      <div class="er"><span class="k">${esc(NM.k4)}</span><span>${opt('s', 0, [['I','bei uns'], ['M','bei ' + NM.v3]])}</span></div>
      <label class="l" for="ea">Anlass</label>
      <input type="text" id="ea" value="${single ? esc(rows[0].a || '') : ''}" placeholder="${single ? 'z. B. Geburtstag, Urlaub …' : 'wird an allen Tagen ergänzt – bestehende Anlässe bleiben'}">
      ${single ? `<label class="l" for="ec">Notiz (nur für euch sichtbar)</label><textarea id="ec">${esc(rows[0].c || '')}</textarea>` : ''}
      <p class="small">Mehrere Anlässe an einem Tag mit „ · “ trennen. Übergaben (Abholen/Bringen) passen sich automatisch an.</p>
    </div>
    <div class="sheetbtns"><button class="btn pri" id="formok">Übernehmen</button><button class="btn" data-act="close">Abbrechen</button></div>`;
  $('sheet').classList.remove('hidden');
  $('sheetcard').querySelectorAll('.opt button').forEach(btn => btn.onclick = () => {
    const box = btn.parentElement, field = box.dataset.field, j = +box.dataset.j, v = btn.dataset.v;
    if (field === 's') FORM.s = v; else FORM.k[j] = v;
    box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === btn));
    const mx = box.parentElement.querySelector('.mixed'); if (mx) mx.remove();
  });
  $('sheetcard').querySelectorAll('[data-quick]').forEach(btn => btn.onclick = () => {
    FORM.k = [btn.dataset.quick, btn.dataset.quick, btn.dataset.quick];
    $('sheetcard').querySelectorAll('.opt[data-field="k"]').forEach(box => {
      box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === btn.dataset.quick));
      const mx = box.parentElement.querySelector('.mixed'); if (mx) mx.remove();
    });
  });
  $('formok').onclick = () => {
    const anl = $('ea').value.trim(), note = single ? $('ec').value.trim() : null;
    for (let i = a; i <= b; i++){
      const r = DRAFT.rows[i];
      r.k = [0,1,2].map(j => FORM.k[j] ?? r.k[j]).join('');
      if (FORM.s) r.s = FORM.s;
      if (single){ r.a = anl; r.c = note; }
      else if (anl){ const ps = (r.a || '').split(' · ').filter(Boolean); if (!ps.includes(anl)) r.a = [...ps, anl].join(' · '); }   // ergänzen, nicht ersetzen
    }
    NOTICE = ''; applyDraft(); closeDetail(); SEL = null; SELSTEP = 0; render(ROOT, true);
  };
}

/* --- Unterschiede beschreiben --- */
function describeChanges(){
  const D = V.days, out = { amj: [], k4: [], other: [] };
  const where = c => c === 'I' ? 'bei ' + NM.p1 : 'bei ' + NM.p2;
  const idx = [...CHG].sort((x, y) => x - y);
  const groups = { amj: [], k4: [], other: [] };
  for (const i of idx){
    const o = PUB.rows[i], n = DRAFT.rows[i];
    const kids = [0,1,2].filter(j => o.k[j] !== n.k[j]);
    if (kids.length){
      const byWhere = {}; kids.forEach(j => (byWhere[n.k[j]] = byWhere[n.k[j]] || []).push(KINDER[j]));
      groups.amj.push([i, Object.entries(byWhere).map(([w, ns]) => `${nameList(ns)} ${where(w)}`).join(', ')]);
    }
    if (o.s !== n.s) groups.k4.push([i, `${NM.k4} ${n.s === 'I' ? 'bei ' + NM.ius : 'bei ' + NM.v3}`]);
    const ot = [];
    if ((o.a || '') !== (n.a || '')) ot.push(n.a ? `Anlass „${n.a}“` : 'Anlass entfernt');
    if ((o.c || '') !== (n.c || '')) ot.push('Notiz geändert');
    if (ot.length) groups.other.push([i, ot.join(', ')]);
  }
  for (const g of ['amj', 'k4', 'other']){
    const list = groups[g];
    for (let x = 0; x < list.length;){
      let y = x; while (y + 1 < list.length && list[y + 1][0] === list[y][0] + 1 && list[y + 1][1] === list[x][1]) y++;
      out[g].push(`${rng(D, list[x][0], list[y][0])}: ${list[x][1]}`); x = y + 1;
    }
  }
  return out;
}
function openPublishSheet(){
  const c = describeChanges();
  const block = (title, lines) => !lines.length ? '' : `<div class="pubbox"><b>${title}</b><ul class="difflist">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  $('sheetcard').innerHTML = `<h3>Veröffentlichen</h3><div class="sub">Das ändert sich – danach sehen es alle, sobald sie die Seite neu laden. Jede Ansicht zeigt die Änderungen, die sie betreffen, unter „Geänderte Tage“.</div>
    ${block('Kinder von ' + NM.p1, c.amj)}
    ${block(NM.k4, c.k4)}
    ${block('Anlässe und Notizen', c.other)}
    <div class="sheetbtns"><button class="btn pri" id="dopub">Jetzt veröffentlichen</button><button class="btn" data-act="close">Abbrechen</button></div>
    <div class="msg" id="pubmsg"></div>`;
  $('sheet').classList.remove('hidden');
  $('dopub').onclick = () => doPublish([], { d: c.amj.length > 0, m: c.k4.length > 0 });
}

/* --- Speichern auf dem Server (Phase 7) --- */
const ghHeaders = token => ({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

/* Speichert neue Stammdaten auf dem Server. Wirft {kind:'auth'|'conflict'} oder Error.
   Der Server nimmt nur an, wenn dort noch genau der Stand liegt, auf dem bearbeitet wurde (VAULT.rev).
   Kalender: nur mit Kalender-Zugang auf diesem Gerät; sonst feedSkipped (K1). */
async function commitMaster(master, message){
  const auth = getAuth();
  if (!auth) throw { kind:'auth' };
  // Verlauf je Tag: Unterschiede zum veröffentlichten Stand festhalten (Wer: wie bisher der Name der Hauptansicht, kein Kontoname)
  master.hist = [...(master.hist || []), ...PlannerCore.diffRows(PUB.rows, master.rows, todayDE(), PUB.names.ius)];
  const oldRev = PlannerCore.revNum(VAULT);
  const vault = await PlannerCore.buildVault(master, ROOT.keys, VAULT.salt, VAULT.iter, oldRev + 1);
  try { await PlannerCore.serverSave(sfetch, SERVER, PLAN_ID, auth.token, oldRev, vault); }
  catch(e){ if (e && e.kind === 'auth') store.del(AUTH_KEY); throw e; }
  // neuen Stand übernehmen, offenen Entwurf (falls vorhanden) auf den neuen Stand übertragen
  const pending = {}; CHG.forEach(i => { pending[DRAFT.rows[i].d] = DRAFT.rows[i]; });
  VAULT = vault; store.set(JSON.stringify(vault), CACHE_KEY);
  const vs = PlannerCore.deriveViews(master);
  ROOT = Object.assign(vs.ius, { master, keys: ROOT.keys });
  PUB = clone(master); DRAFT = clone(master);
  DRAFT.rows.forEach((r, i) => { if (pending[r.d]) DRAFT.rows[i] = clone(pending[r.d]); });
  applyDraft();
  let feedError = null, feedSkipped = false;          // Kalender gleich mit aktualisieren (nur mit Kalender-Zugang); Fehler melden statt verschlucken
  try { feedSkipped = (await syncFeeds(master, true)) === 'none'; FEED_ERR = null; } catch(e){ feedError = e; FEED_ERR = e; }
  return { vault, feedError, feedSkipped };
}
let FEED_ERR = null;
const feedErrText = e => e && e.kind === 'gist' ? 'dem Kalender-Zugang fehlt das Recht „Gists: Read and write“'
  : e && e.kind === 'token' ? 'der Kalender-Zugang ist ungültig oder abgelaufen' : 'GitHub war nicht erreichbar';
function publishError(err, say){
  if (err && err.kind === 'auth') say(`Zum Speichern bitte anmelden (die Anmeldung fehlt oder ist abgelaufen). <a href="#" data-act="login">Anmelden</a>`, 'err');
  else if (err && err.kind === 'token') say(`Der Kalender-Zugang auf diesem Gerät fehlt, ist abgelaufen oder hat nicht die nötigen Rechte. <a href="#" data-act="token">Kalender-Zugang einrichten</a>`, 'err');
  else if (err && err.kind === 'gist') say(`Für die Kalender-Links fehlt dem Kalender-Zugang das Recht „Gists: Read and write“ (bei GitHub im Token unter „Account permissions“ ergänzen).`, 'err');
  else if (err && err.kind === 'conflict') say(`Der Plan wurde inzwischen an anderer Stelle geändert. <a href="#" data-act="reload">Seite neu laden</a> – dein Entwurf wird dabei übernommen.`, 'err');
  else if (err && /^Daten fehlerhaft/.test(err.message || '')) say(esc(err.message), 'err');
  else say(esc(err && err.message || 'Unbekannter Fehler') + ' – bitte Internetverbindung prüfen und erneut versuchen.', 'err');
}
async function doPublish(entries, pdf = {}){
  if (!getAuth()){ openLoginSheet(true); return; }
  const msg = $('pubmsg'), btn = $('dopub');
  const say = (t, cls) => { msg.className = 'msg ' + (cls || ''); msg.innerHTML = t; };
  btn.disabled = true; say('Speichere …');
  try {
    const d = todayDE(), [dd, mm, yy] = d.split('.');
    const master = clone(DRAFT);
    master.stand = d;
    master.changes = [...PUB.changes, ...entries.map(e => ({ d, iso: `${yy}-${mm}-${dd}`, wer: e.wer, text: e.text }))];
    CHG = new Set();                                   // alles im Entwurf wird jetzt veröffentlicht
    const res = await commitMaster(master, `Plan geändert (${d})`);
    store.del(DRAFT_KEY);
    const seenKey = 'kinderplanung_gelesen_ius'; let seen = [];
    try { seen = JSON.parse(store.get(seenKey) || '[]'); } catch(e){}
    seen = seen.map(x => { const i = String(x).indexOf('|'); return i > 0 ? x.slice(0, i) + '#' + shortHash(x.slice(i + 1)) : x; });
    master.changes.forEach(c => seen.includes(newsId(c)) || seen.push(newsId(c))); store.set(JSON.stringify(seen), seenKey);
    EDIT = false; SEL = null; NOTICE = '';
    $('sheetcard').innerHTML = `<h3>Gespeichert ✓</h3><p>Die Änderungen sind veröffentlicht. Für ${esc(NM.p2)} und ${esc(NM.v3)} sind sie sofort sichtbar, sobald sie die Seite neu laden${PUB.feeds && !res.feedError && !res.feedSkipped ? ', in den abonnierten Kalendern je nach App nach einigen Stunden' : ''}.</p>
      ${PUB.feeds && res.feedSkipped && !res.feedError ? `<p class="msg">Die abonnierten Kalender werden beim nächsten Öffnen durch ${esc(NM.p1 || 'das Gerät mit Kalender-Zugang')} aktualisiert.</p>` : ''}
      ${PUB.feeds && res.feedError ? `<p class="msg err">Die abonnierten Kalender konnten nicht aktualisiert werden: ${esc(feedErrText(res.feedError))}. Bitte später unter „📅 Kalender“ → „Kalender jetzt aktualisieren“ erneut versuchen.</p>` : ''}
      ${pdf.d || entries.some(e => e.wer.includes('D')) ? `<button class="btn" style="width:100%;margin-top:8px" data-sendpdf="v2">📄 Aktuelles PDF an ${esc(NM.p2)} schicken</button>` : ''}
      ${pdf.m || entries.some(e => e.wer.includes('M')) ? `<button class="btn" style="width:100%;margin-top:8px" data-sendpdf="v3">📄 Aktuelles PDF an ${esc(NM.v3)} schicken</button>` : ''}
      <div class="sheetbtns"><button class="btn pri" data-act="close">Schließen</button></div>`;
    tageGelesen(ROOT);                                 // eigene Änderungen gelten auf diesem Gerät als gelesen
    render(ROOT, true);
    $('sheetcard').querySelectorAll('[data-sendpdf]').forEach(b => b.onclick = () => sharePdf(ROOT.others[b.dataset.sendpdf]));
  } catch(err){
    applyDraft(false);                                 // Entwurf bleibt erhalten
    btn.disabled = false; publishError(err, say);
  }
}

/* ================= Kalender-Abo (geheime Gists, nur Text) ================= */
const ICS_FILE = 'kinderplanung.ics';
async function gistCall(path, method, body){
  const token = store.get(TOKEN_KEY);
  if (!token) throw { kind:'token' };
  const r = await fetch('https://api.github.com/gists' + path, { method, cache:'no-store',
    headers: { ...ghHeaders(token), ...(body ? { 'Content-Type':'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) throw { kind:'token' };
  if (r.status === 403 || (r.status === 404 && method === 'POST')) throw { kind:'gist' };
  if (!r.ok && !(method === 'DELETE' && r.status === 404)) throw new Error('GitHub-Kalender: Fehler ' + r.status);
  return r.status === 204 ? null : r.json();
}
const feedDesc = () => `Kalender · Version ${PlannerCore.revNum(VAULT)} · ${todayDE()}`;
const feedIsCurrent = desc => String(desc || '').startsWith(`Kalender · Version ${PlannerCore.revNum(VAULT)} ·`);
async function syncFeeds(master, force){
  const F = master && master.feeds;
  if (!F || !store.get(TOKEN_KEY)) return 'none';
  const desc = feedDesc();
  if (!force){ const g = await gistCall('/' + F.ius.id, 'GET'); if (g && feedIsCurrent(g.description)) return 'ok'; }
  const vs = PlannerCore.deriveViews(master);
  for (const v of ['v2', 'v3', 'v4', 'v5', 'v6', 'ius']) if (F[v])   // Q1: eigener Kalender zuletzt = Quittung für alle
    await gistCall('/' + F[v].id, 'PATCH', { description: desc, files: { [ICS_FILE]: { content: PlannerCore.buildICS(vs[v]) } } });
  return 'updated';
}
async function newGist(view, vs){
  const g = await gistCall('', 'POST', { description: feedDesc(), public: false, files: { [ICS_FILE]: { content: PlannerCore.buildICS(vs[view]) } } });
  return { id: g.id, raw: `https://gist.githubusercontent.com/${g.owner.login}/${g.id}/raw/${ICS_FILE}` };
}
/* Q5: gerade angelegte Kalender wieder löschen, wenn das Speichern scheitert */
async function dropGists(list){ for (const g of list) if (g && g.id) { try { await gistCall('/' + g.id, 'DELETE'); } catch(e){} } }
async function setupFeeds(say){
  if (!getAuth()){ publishError({ kind:'auth' }, say); return; }   // erst Anmeldung prüfen, dann Gists anlegen
  say('Richte Kalender-Links ein …');
  try {
    const vs = PlannerCore.deriveViews(PUB), feeds = {};
    try { for (const v of ['ius', 'v2', 'v3', 'v4', 'v5', 'v6']) feeds[v] = await newGist(v, vs); }
    catch(e){ await dropGists(Object.values(feeds)); throw e; }
    const d = todayDE(), [dd, mm, yy] = d.split('.');
    const master = clone(PUB); master.feeds = feeds;
    master.changes = [...PUB.changes, { d, iso: `${yy}-${mm}-${dd}`, wer: 'IDM', text: 'Neu: Knopf „Kalender“ – den Plan im eigenen Kalender abonnieren (Outlook, iPhone, Apple, Google); aktualisiert sich von selbst.' }];
    let res; try { res = await commitMaster(master, 'Kalender-Links eingerichtet'); } catch(e){ await dropGists(Object.values(feeds)); throw e; }   // Q5
    render(ROOT, true); openCal(res.feedError ? null : 'Kalender-Links eingerichtet.');
  } catch(err){ publishError(err, say); }
}
async function renewFeed(view, say){
  if (!getAuth()){ publishError({ kind:'auth' }, say); return; }   // erst Anmeldung prüfen, dann Gists anlegen
  say('Erzeuge neuen Link …');
  try {
    const old = PUB.feeds[view];
    const master = clone(PUB);
    master.feeds[view] = await newGist(view, PlannerCore.deriveViews(PUB));
    try { await commitMaster(master, 'Kalender-Link erneuert'); } catch(e){ await dropGists([master.feeds[view]]); throw e; }   // Q5
    try { await gistCall('/' + old.id, 'DELETE'); } catch(e){}
    render(ROOT, true); openCal(`Neuer Link erzeugt. Der alte funktioniert nicht mehr – bitte neu abonnieren${view === 'ius' ? '' : ' bzw. den neuen Link weitergeben'}.`);
  } catch(err){ publishError(err, say); }
}
const viewName = v => v === 'ius' ? NM.ius : v === 'v2' ? NM.p2 : v === 'v3' ? NM.v3 : v === 'v5' ? NM.k4 : v === 'v6' ? KINDER[0] : (NM.k5 || v);
/* fehlenden Kalender-Link einer neuen Ansicht nachträglich anlegen */
async function addFeed(view, say){
  if (!getAuth()){ publishError({ kind:'auth' }, say); return; }   // erst Anmeldung prüfen, dann Gists anlegen
  say('Richte Kalender-Link ein …');
  try {
    const master = clone(PUB);
    master.feeds = { ...(master.feeds || {}), [view]: await newGist(view, PlannerCore.deriveViews(PUB)) };
    try { await commitMaster(master, 'Kalender-Link ergänzt'); } catch(e){ await dropGists([master.feeds[view]]); throw e; }   // Q5
    render(ROOT, true); openCal(`Kalender-Link für ${viewName(view)} eingerichtet.`);
  } catch(err){ publishError(err, say); }
}
function openCal(note){
  const isRoot = V === ROOT && ROOT.master, feeds = isRoot ? ROOT.master.feeds : null;
  const url = isRoot ? (feeds && feeds.ius && feeds.ius.raw) : V.calUrl;
  const copyRow = (u, id) => `<div class="calurl"><input type="text" readonly value="${esc(u)}" id="cu_${id}"><button class="btn" data-copy="cu_${id}">Kopieren</button></div>`;
  let h = `<h3>Kalender abonnieren</h3>`;
  if (note) h += `<p class="msg ok">${esc(note)}</p>`;
  if (url){
    h += `<p class="small">Die Termine (wer wann wo ist, Abholen & Bringen, Ferien, Feiertage, Geburtstage) erscheinen in deinem Kalender und aktualisieren sich von selbst – je nach App nach einigen Minuten bis Stunden.</p>
      ${copyRow(url, 'me')}
      <a class="btn pri" style="display:block;text-align:center;text-decoration:none;margin:10px 0" href="${esc(url.replace(/^https:/, 'webcal:'))}">📱 iPhone / iPad / Mac: direkt abonnieren</a>
      <details class="howto"><summary>iPhone / iPad – falls der Knopf nicht klappt</summary>Link kopieren → Einstellungen → (Apps →) Kalender → Accounts → Account hinzufügen → Andere → <b>Kalenderabo hinzufügen</b> → Link einfügen → Sichern.</details>
      <details class="howto"><summary>Outlook (Windows)</summary>Link kopieren → in Outlook zum Kalender wechseln → <b>Kalender hinzufügen</b> → <b>Aus dem Internet</b> (bzw. „Aus dem Internet abonnieren“) → Link einfügen → Name z. B. „Kinderplanung“.</details>
      <details class="howto"><summary>Outlook im Browser / Outlook-App</summary>Im Browser auf outlook.com bzw. Outlook im Web: Kalender → <b>Kalender hinzufügen</b> → <b>Aus dem Internet abonnieren</b> → Link einfügen. Die Outlook-App am Handy zeigt den Kalender danach automatisch mit an.</details>
      <details class="howto"><summary>Google Kalender</summary>Im Browser: links bei „Weitere Kalender“ auf <b>+</b> → <b>Per URL</b> → Link einfügen.</details>
      <p class="small">Bitte den Link nicht weitergeben – wer ihn hat, kann die Termine sehen (ohne PIN).</p>`;
  } else if (!isRoot){
    h += `<p>Das Kalender-Abo ist für dich noch nicht eingerichtet.</p>
      <p class="small">${NM.p1 ? esc(NM.p1) + ' muss es erst freischalten – sag ihm einfach Bescheid.' : 'Es muss erst freigeschaltet werden – bitte kurz Bescheid geben.'} Danach findest du hier deinen persönlichen Link.</p>`;
  } else {
    h += `<p class="small">Noch keine Kalender-Links vorhanden. Beim Einrichten entstehen drei geheime Links – für euch, für ${esc(NM.p2)} und für ${esc(NM.v3)}. Jede Person sieht darin nur ihre eigene Ansicht.</p>
      <p class="small">Voraussetzung: Kalender-Zugang auf diesem Gerät (GitHub, Recht „Gists: Read and write“) und Anmeldung zum Speichern.</p>
      <button class="btn pri" style="width:100%;padding:11px" id="calsetup">Kalender-Links einrichten</button>`;
  }
  if (isRoot && feeds){
    h += `<h4 style="margin:18px 0 6px">Links der anderen</h4><p class="small">Sehen ${esc(NM.p2)} und ${esc(NM.v3)} auch selbst in ihrer Ansicht unter „Kalender“.</p>
      ${['v2', 'v3', 'v4', 'v5', 'v6'].filter(v => feeds[v]).map(v => `<div style="margin:8px 0"><b>${esc(viewName(v))}</b>${copyRow(feeds[v].raw, v)}</div>`).join('')}
      ${['v4', 'v5', 'v6'].filter(v => !feeds[v] && ROOT.others[v]).map(v => `<button class="btn" style="width:100%;margin:6px 0" data-caladd="${v}">Kalender-Link für ${esc(viewName(v))} einrichten</button>`).join('')}
      <details class="howto"><summary>Link ungültig machen und neu erzeugen</summary>
        <p class="small">Falls ein Link in falsche Hände geraten ist. Wer ihn abonniert hat, muss danach neu abonnieren.</p>
        <div class="quick">${['ius', 'v2', 'v3', 'v4', 'v5', 'v6'].filter(v => feeds[v]).map(v => `<button class="btn" data-renew="${v}">${esc(viewName(v))}</button>`).join('')}</div></details>
      <p class="small" id="calstate">Prüfe Stand der Kalender …</p>
      <button class="btn" style="width:100%;margin-top:8px" id="calsync">Kalender jetzt aktualisieren</button>`;
  }
  if (isRoot){
    const R = ROOT.master.reise;
    h += `<h4 style="margin:18px 0 6px">Dienstreisen per Mail</h4>` + (R && R.pub
      ? `<p class="small">Eingerichtet. Neue Reisen werden beim Öffnen übernommen (nur mit dem dafür freigegebenen Konto). Öffentlicher Schlüssel für die Einrichtung:</p>${copyRow(JSON.stringify(R.pub), 'reise')}`
      : `<p class="small">Noch nicht eingerichtet. Beim Einrichten entsteht ein Schlüsselpaar; der private Teil bleibt verschlüsselt im Plan.</p><button class="btn" style="width:100%" id="reisesetup">Dienstreisen einrichten</button>`);
  }
  h += `<button id="closesheet">Schließen</button><div class="msg" id="calmsg"></div>`;
  $('sheetcard').innerHTML = h;
  $('sheet').classList.remove('hidden');
  $('closesheet').onclick = closeDetail;
  const say = (t, cls) => { $('calmsg').className = 'msg ' + (cls || ''); $('calmsg').innerHTML = t; };
  $('sheetcard').querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
    const inp = $(b.dataset.copy);
    try { await navigator.clipboard.writeText(inp.value); } catch(e){ inp.select(); try { document.execCommand('copy'); } catch(e2){} }
    b.textContent = 'Kopiert ✓'; setTimeout(() => b.textContent = 'Kopieren', 1800);
  });
  if ($('reisesetup')) $('reisesetup').onclick = () => setupReise(say);
  if ($('calsetup')) $('calsetup').onclick = () => store.get(TOKEN_KEY) ? setupFeeds(say) : openTokenSheet(false);
  const showState = async () => {
    if (!$('calstate')) return;
    if (!store.get(TOKEN_KEY)){ $('calstate').textContent = 'Stand der Kalender nur mit Kalender-Zugang auf diesem Gerät prüfbar.'; return; }
    try {
      const g = await gistCall('/' + feeds.ius.id, 'GET');
      const cur = feedIsCurrent(g && g.description);
      $('calstate').className = 'small' + (cur ? '' : ' msg err');
      $('calstate').textContent = cur ? `Kalender sind aktuell (${String(g.description).split('·').pop().trim()}).` : 'Die Kalender sind nicht auf dem neuesten Stand – bitte „Kalender jetzt aktualisieren“.';
    } catch(err){ $('calstate').className = 'small msg err'; $('calstate').textContent = 'Kalender-Stand nicht prüfbar: ' + feedErrText(err) + '.'; }
  };
  showState();
  if ($('calsync')) $('calsync').onclick = async () => { say('Aktualisiere …'); try { await syncFeeds(PUB, true); FEED_ERR = null; say('Kalender aktualisiert ✓', 'ok'); showState(); } catch(err){ FEED_ERR = err; publishError(err, say); } };
  $('sheetcard').querySelectorAll('[data-renew]').forEach(b => b.onclick = () => renewFeed(b.dataset.renew, say));
  $('sheetcard').querySelectorAll('[data-caladd]').forEach(b => b.onclick = () => store.get(TOKEN_KEY) ? addFeed(b.dataset.caladd, say) : openTokenSheet(false));
}

/* ================= Dienstreisen per Mail (nur Hauptansicht, Bauplan_Dienstreisen.md) =================
   Der Server hält nur verschlüsselte Einträge; nur das freigegebene Konto darf sie abholen (sonst 403).
   Eingearbeitet wird automatisch und ohne „Was ist neu?“-Eintrag. */
async function setupReise(say){
  if (!getAuth()){ publishError({ kind:'auth' }, say); return; }
  say('Erzeuge Schlüssel …');
  try {
    const k = await crypto.subtle.generateKey({ name:'RSA-OAEP', modulusLength:3072, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256' }, true, ['encrypt','decrypt']);
    const master = clone(PUB);
    master.reise = { priv: await crypto.subtle.exportKey('jwk', k.privateKey), pub: await crypto.subtle.exportKey('jwk', k.publicKey) };
    await commitMaster(master, 'Dienstreisen eingerichtet');
    render(ROOT, true); openCal('Dienstreisen eingerichtet ✓ Den öffentlichen Schlüssel unten kopieren und für die Einrichtung weitergeben.');
  } catch(err){ publishError(err, say); }
}
async function reiseEntschluesseln(priv, blob){
  const b = JSON.parse(blob);
  const raw = await crypto.subtle.decrypt({ name:'RSA-OAEP' }, priv, fromB64(b.k));
  const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name:'AES-GCM', iv: fromB64(b.iv) }, aes, fromB64(b.ct))));
}
let REISE_LAEUFT = false;
async function holeReisen(){
  const auth = getAuth(), R = ROOT && ROOT.master && ROOT.master.reise;
  if (REISE_LAEUFT || OFFLINE || !auth || !R || !R.priv) return;
  REISE_LAEUFT = true;
  try {
    const r = await sfetch(SERVER + '/api/planer/reise', { headers: { Authorization: auth.token }, cache:'no-store' });
    if (!r.ok) return;                                   // z. B. 403: dieses Konto holt nicht ab
    const liste = await r.json();
    if (!Array.isArray(liste) || !liste.length) return;
    const priv = await crypto.subtle.importKey('jwk', R.priv, { name:'RSA-OAEP', hash:'SHA-256' }, false, ['decrypt']);
    let reisen = PUB.reisen || [];
    for (const x of liste){ try { reisen = PlannerCore.reiseEinarbeiten(reisen, await reiseEntschluesseln(priv, x.blob)); } catch(e){} }   // Unlesbares wird verworfen
    if (JSON.stringify(reisen) !== JSON.stringify(PUB.reisen || [])){
      const warRoot = V === ROOT, master = clone(PUB);
      master.reisen = reisen;
      master.hist = [...(master.hist || []), ...PlannerCore.reiseVerlauf(PUB.reisen || [], reisen, todayDE(), PUB.names.ius)];
      await commitMaster(master, 'Dienstreisen eingetragen');
      if (warRoot) render(ROOT, true);
      toast('Dienstreisen aktualisiert');
    }
    await sfetch(SERVER + '/api/planer/reise/quittung', { method:'POST', headers: { Authorization: auth.token, 'Content-Type':'application/json' }, body: JSON.stringify({ ids: liste.map(x => x.id) }) });
  } catch(e){ /* beim nächsten Öffnen erneut */ }
  finally { REISE_LAEUFT = false; }
}

/* --- Anmeldung am Server (einmal pro Gerät, 90 Tage) --- */
function openLoginSheet(thenPublish){
  const a = getAuth();
  $('sheetcard').innerHTML = `<h3>Anmelden zum Speichern</h3>
    <p class="small">Einmal pro Gerät nötig, gilt 90 Tage. Mit deiner E-Mail-Adresse und deinem eigenen Passwort (aus dem Passwortmanager). Die PIN bleibt davon unberührt und wird nie an den Server geschickt.</p>
    ${a ? `<p class="msg ok">Angemeldet bis ${esc(new Date(a.exp).toLocaleDateString('de-DE'))}.</p>` : ''}
    <form id="loginform" autocomplete="on">
      <input id="lg_mail" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="E-Mail-Adresse" required style="margin-bottom:8px">
      <input id="lg_pw" type="password" autocomplete="current-password" placeholder="Passwort" required>
      <div class="sheetbtns"><button class="btn pri" id="lg_go" type="submit">Anmelden</button><button class="btn" type="button" data-act="close">Abbrechen</button></div>
    </form>
    ${a ? '<p class="small"><a href="#" id="lg_out">Anmeldung auf diesem Gerät entfernen</a></p>' : ''}
    <div class="msg" id="lgmsg"></div>`;
  $('sheet').classList.remove('hidden');
  if ($('lg_out')) $('lg_out').onclick = e => { e.preventDefault(); store.del(AUTH_KEY); $('lgmsg').className = 'msg ok'; $('lgmsg').textContent = 'Anmeldung entfernt.'; };
  $('loginform').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('lgmsg'), btn = $('lg_go');
    btn.disabled = true; m.className = 'msg'; m.textContent = 'Prüfe …';
    try {
      const res = await PlannerCore.serverLogin(sfetch, SERVER, $('lg_mail').value.trim(), $('lg_pw').value);
      store.set(JSON.stringify(res), AUTH_KEY);
      $('lg_pw').value = '';
      m.className = 'msg ok'; m.textContent = 'Angemeldet ✓';
      if (thenPublish && CHG.size) setTimeout(openPublishSheet, 600);
      else setTimeout(holeReisen, 600);
    } catch(err){
      m.className = 'msg err';
      m.textContent = err && err.kind === 'login' ? 'E-Mail oder Passwort stimmt nicht.' : (err && err.message || 'Anmeldung fehlgeschlagen.');
    } finally { btn.disabled = false; }
  });
}

/* --- Kalender-Zugang (GitHub, nur Gists; vorerst nur auf einem Gerät) --- */
function openTokenSheet(thenPublish){
  const has = !!store.get(TOKEN_KEY);
  $('sheetcard').innerHTML = `<h3>Kalender-Zugang einrichten</h3>
    <p class="small">Nur nötig auf dem Gerät, das die abonnierten Kalender aktualisiert. Zum Speichern des Plans braucht man ihn nicht. Der Zugang wird nur auf diesem Gerät gespeichert und darf nur die Kalender-Dateien (Gists) ändern.</p>
    <ol class="steps">
      <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Diesen Link öffnen</a> und bei GitHub anmelden.</li>
      <li><b>Token name</b>: z. B. „Kalender ${esc(navigator.platform || 'Gerät')}“. <b>Expiration</b>: „Custom“ und ein Datum in einem Jahr.</li>
      <li><b>Repository access</b>: „Public repositories (read-only)“ lassen – <b>kein</b> Repository auswählen.</li>
      <li><b>Account permissions</b> → <b>Gists</b> auf „Read and write“. Sonst nichts.</li>
      <li>Ganz unten <b>Generate token</b> → den Code (beginnt mit „github_pat_“) kopieren und hier einfügen.</li>
    </ol>
    <input id="tok" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="github_pat_…">
    <label class="small" for="tokexp" style="display:block;margin-top:10px">Gültig bis (wie bei GitHub unter „Expiration“ eingestellt) – die Seite erinnert rechtzeitig:</label>
    <input id="tokexp" type="date" value="${esc(store.get(TOKEN_EXP_KEY) || '')}" style="font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:10px">
    <div class="sheetbtns"><button class="btn pri" id="savetok">Prüfen und speichern</button><button class="btn" data-act="close">Abbrechen</button></div>
    ${has ? '<p class="small"><a href="#" id="deltok">Kalender-Zugang auf diesem Gerät entfernen</a></p>' : ''}
    <div class="msg" id="tokmsg"></div>`;
  $('sheet').classList.remove('hidden');
  if ($('deltok')) $('deltok').onclick = e => { e.preventDefault(); store.del(TOKEN_KEY); store.del(TOKEN_EXP_KEY); $('tokmsg').className = 'msg ok'; $('tokmsg').textContent = 'Entfernt.'; };
  $('savetok').onclick = async () => {
    const tok = $('tok').value.trim(), m = $('tokmsg');
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(tok)){ m.className = 'msg err'; m.textContent = 'Das sieht nicht wie ein GitHub-Zugangscode aus (beginnt mit „github_pat_“).'; return; }
    m.className = 'msg'; m.textContent = 'Prüfe …';
    try {
      // Prüft nur das Gist-Recht: vorhandenen Kalender unverändert zurückschreiben (Schreibprobe), sonst Gists auflisten
      const F = PUB && PUB.feeds && PUB.feeds.ius;
      let r;
      if (F){
        const g = await fetch('https://api.github.com/gists/' + F.id, { headers: ghHeaders(tok), cache:'no-store' });
        r = g.ok ? await fetch('https://api.github.com/gists/' + F.id, { method:'PATCH', headers: { ...ghHeaders(tok), 'Content-Type':'application/json' }, cache:'no-store',
          body: JSON.stringify({ description: (await g.json()).description || feedDesc() }) }) : g;
      } else r = await fetch('https://api.github.com/gists?per_page=1', { headers: ghHeaders(tok), cache:'no-store' });
      if (!r.ok){ m.className = 'msg err'; m.textContent = r.status === 401 ? 'Code wurde nicht akzeptiert (ungültig oder abgelaufen).' : r.status === 403 || r.status === 404 ? 'Dem Code fehlt das Recht „Gists: Read and write“.' : 'GitHub antwortet nicht (' + r.status + ').'; return; }
      store.set(tok, TOKEN_KEY);
      // Ablaufdatum: von GitHub, falls lesbar, sonst die Eingabe
      const hdr = r.headers.get('github-authentication-token-expiration');
      let exp = $('tokexp').value;
      if (hdr){ const dt = new Date(hdr.replace(' UTC', 'Z').replace(/^(\d{4}-\d\d-\d\d) /, '$1T').replace(/ ([+-]\d\d)(\d\d)$/, '$1:$2')); if (!isNaN(dt)) exp = dt.toISOString().slice(0,10); }   // Q3: robust
      if (exp) store.set(exp, TOKEN_EXP_KEY); else store.del(TOKEN_EXP_KEY);
      m.className = 'msg ok'; m.textContent = 'Gespeichert ✓';
      if (ROOT && ROOT.master && ROOT.master.feeds) syncFeeds(PUB, false).then(() => { FEED_ERR = null; }).catch(e => { FEED_ERR = e; });
    } catch(e){ m.className = 'msg err'; m.textContent = 'Keine Verbindung zu GitHub.'; }
  };
}

/* ================= Änderung anfragen (per WhatsApp an die Hauptansicht) ================= */
function openRequest(i){
  const D = V.days, iso = d => d.d.split('.').reverse().join('-');
  const isV2 = V.view === 'v2';
  const opts = isV2
    ? [['bei', 'Kinder bei mir'], ['weg', `Kinder bei ${NM.p1}`], ['sonst', 'Etwas anderes']]
    : [['bei', `${NM.k4} bei mir`], ['weg', `${NM.k4} bei ${NM.ius}`], ['sonst', 'Etwas anderes']];
  $('sheetcard').innerHTML = `<h3>Änderung anfragen</h3>
    <div class="sub">Die Anfrage geht per WhatsApp an ${esc(V.contact.to)}. Im Plan ändert sich erst etwas, wenn sie eingetragen ist.</div>
    <div class="ef">
      <div class="er"><span class="k">Von</span><input type="date" id="rqa" value="${iso(D[i])}" min="${iso(D[0])}" max="${iso(D[D.length-1])}"></div>
      <div class="er"><span class="k">Bis</span><input type="date" id="rqb" value="${iso(D[i])}" min="${iso(D[0])}" max="${iso(D[D.length-1])}"></div>
      <label class="l">Was wünschst du dir?</label>
      <span class="opt" id="rqopt">${opts.map(([v, t], j) => `<button type="button" data-v="${v}" class="${j === 0 ? 'on' : ''}">${esc(t)}</button>`).join('')}</span>
      <label class="l" for="rqt">Nachricht / Grund (optional)</label>
      <textarea id="rqt" placeholder="z. B. Geburtstag bei Oma, Tausch gegen das Wochenende danach …"></textarea>
      <label class="l">So sieht die Nachricht aus</label>
      <div class="note" id="rqprev" style="white-space:pre-wrap"></div>
    </div>
    <div class="sheetbtns"><a class="btn pri" id="rqsend" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">Per WhatsApp senden</a><button class="btn" data-act="close">Abbrechen</button></div>
    <div class="msg err" id="rqerr"></div>`;
  $('sheet').classList.remove('hidden');
  let choice = 'bei';
  const idxOf = s => D.findIndex(d => iso(d) === s);
  const update = () => {
    let a = idxOf($('rqa').value), b = idxOf($('rqb').value);
    if (a < 0){ $('rqerr').textContent = 'Bitte ein Datum im Plan wählen.'; return; }
    if (b < a){ b = a; $('rqb').value = $('rqa').value; }
    $('rqerr').textContent = '';
    // Was steht derzeit im Plan?
    const states = new Set();
    for (let x = a; x <= b; x++){
      const d = D[x];
      if (isV2){ const n = bei(d,'D').length; states.add(n === 3 ? 'bei mir' : n === 0 ? 'bei ' + NM.p1 : 'teils bei mir, teils bei ' + NM.p1); }
      else states.add(d.s === 'M' ? 'bei mir' : 'bei ' + NM.ius);
    }
    const label = opts.find(o => o[0] === choice)[1];
    const what = choice === 'sonst' ? '' : `\nWunsch: ${label} (laut Plan: ${[...states].join(' / ')})`;
    const note = $('rqt').value.trim();
    const link = `${location.origin}${location.pathname}#bearbeiten-${iso(D[a]).replace(/-/g,'')}-${iso(D[b]).replace(/-/g,'')}`;
    const text = `Änderungsanfrage Kinderplanung von ${V.label}\n${rng(D, a, b)}${what}${note ? '\n' + note : ''}\n\nIm Plan öffnen: ${link}`;
    $('rqprev').textContent = text;
    $('rqsend').href = `https://wa.me/${V.contact.wa}?text=${encodeURIComponent(text)}`;
  };
  $('rqopt').querySelectorAll('button').forEach(btn => btn.onclick = () => {
    choice = btn.dataset.v; $('rqopt').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === btn)); update(); });
  ['rqa', 'rqb', 'rqt'].forEach(id => $(id).addEventListener('input', update));
  $('rqsend').addEventListener('click', () => setTimeout(closeDetail, 300));
  update();
}

/* ================= Heute ================= */
function toast(msg){ const el = $('toast'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 3000); }
function goToday(){
  if (!V) return;
  const now = calcToday();
  if (now !== todayStr){ todayStr = now; renderMonth(); renderTable(V); }
  const D = V.days, i = D.findIndex(d => d.d === todayStr);
  let target = i;
  if (i < 0){
    const before = parse(D[0].d) > new Date();
    target = before ? 0 : D.length - 1;
    toast(before ? `Der Plan beginnt am ${D[0].d} – hier ist der erste Monat.` : `Der Plan endet am ${D[D.length-1].d}.`);
  }
  MI = MONTHS.findIndex(g => target >= g.from && target <= g.to);
  if (TAB === 'year'){
    const el = document.querySelector(`[data-gm="${MI}"]`); if (el) el.scrollIntoView({ behavior:'smooth', block:'center' });
    return;
  }
  if (TAB === 'table'){
    const el = document.querySelector(`.row[data-i="${target}"]`);
    if (el){ el.scrollIntoView({ behavior:'smooth', block:'center' }); if (i >= 0){ el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }
    return;
  }
  renderMonth(); window.scrollTo({ top: 0, behavior:'smooth' });
  if (i >= 0){ const c = document.querySelector(`.mc[data-i="${i}"]`); if (c) c.classList.add('flash'); }
}

/* ================= Neu laden (Knopf ↻ und – als Home-Bildschirm-App – Herunterziehen) ================= */
const STANDALONE = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
let RELOADING = false;
async function hardReload(){
  if (RELOADING) return; RELOADING = true;
  toast('Lade neuesten Stand …');
  // Seite und Programmteile am Zwischenspeicher vorbei neu holen, damit auch Änderungen an der Seite selbst ankommen
  await Promise.all(['./', 'index.html', 'app.js', 'core.js', 'manifest.json'].map(u => fetch(u, { cache:'reload' }).catch(() => null)));
  location.reload();
}
(() => {
  if (!STANDALONE) return;                              // im Browser gibt es das Herunterziehen schon
  const ind = $('ptr'), LIMIT = 90;
  let y0 = null, x0 = 0, dy = 0, dx = 0;
  const hide = () => { ind.classList.add('hidden'); ind.style.transform = ''; };
  addEventListener('touchstart', e => {
    y0 = (window.scrollY <= 0 && e.touches.length === 1 && $('sheet').classList.contains('hidden')) ? e.touches[0].clientY : null;
    if (y0 !== null){ x0 = e.touches[0].clientX; dy = dx = 0; }
  }, { passive:true });
  addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0; dx = e.touches[0].clientX - x0;
    if (dy < 15 || Math.abs(dx) > dy || window.scrollY > 0){ hide(); return; }
    ind.classList.remove('hidden');
    ind.style.transform = `translate(-50%, ${Math.min(dy, 140) * 0.5 - 20}px)`;
    ind.textContent = dy > LIMIT ? '↻ Loslassen zum Aktualisieren' : '↓ Zum Aktualisieren ziehen';
  }, { passive:true });
  addEventListener('touchend', () => {
    if (y0 === null) return;
    const go = dy > LIMIT && Math.abs(dx) < dy && window.scrollY <= 0;
    y0 = null;
    if (go){ ind.textContent = 'Lade neu …'; hardReload(); } else hide();
  }, { passive:true });
})();

/* ================= Rahmen ================= */
let V = null, ROOT = null, TAB = 'month';
function setTab(t){
  TAB = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  ['month','year','table'].forEach(x => $(x).classList.toggle('hidden', x !== t));
  $('monthnav').classList.toggle('hidden', t !== 'table');
  window.scrollTo(0, 0);
  if (t === 'table'){
    const now = new Date(), cur = document.getElementById('m' + (now.getFullYear()*12 + now.getMonth()));
    if (cur) setTimeout(() => cur.scrollIntoView({block:'start'}), 30);
  }
}
function render(v, keepMonth){
  V = v;
  if (v.names){ NM = { kids: ['', '', ''], k4: '', p1: '', ius: '', p2: '', v3: '', ...v.names }; KINDER = NM.kids; }
  const isPreview = ROOT && v !== ROOT;
  $('who').textContent = (isPreview ? 'Vorschau ' : 'Ansicht ') + v.label;
  $('stand').textContent = 'Stand ' + v.stand;
  $('preview').classList.toggle('hidden', !isPreview);
  if (isPreview) $('preview').textContent = `So sieht ${v.label} den Plan mit der eigenen PIN. Nur zur Ansicht.`;
  if (ROOT && ROOT.others){
    const opts = [['ius', ROOT], ['v2', ROOT.others.v2], ['v3', ROOT.others.v3], ...['v4', 'v5', 'v6'].filter(k => ROOT.others[k]).map(k => [k, ROOT.others[k]])];
    $('switch').innerHTML = '<span class="lab">Ansicht:</span> ' + opts.map(([k, p]) => `<button data-view="${k}" class="${p === v ? 'on' : ''}">${esc(p.label)}</button>`).join('');
    $('switch').classList.remove('hidden');
  } else $('switch').classList.add('hidden');
  if (MODE_DEFAULT[v.view]){
    const saved = store.get(modeKey(v.view));
    MODE = saved === 'da' || saved === 'frei' ? saved : MODE_DEFAULT[v.view];
    const lab = v.view === 'v3' ? [['da', `${NM.k4} bei mir`], ['frei', 'Meine freien Tage']] : [['frei', 'Meine freien Tage'], ['da', 'Kinder bei mir']];
    $('modeseg').innerHTML = lab.map(([m, t]) => `<button data-mode="${m}" class="${m === MODE ? 'on' : ''}">${esc(t)}</button>`).join('');
    $('modeseg').classList.remove('hidden');
  } else $('modeseg').classList.add('hidden');
  PLANYEAR = planYearOf(v); MONTHS = monthsOf(v); RUNS = buildRuns(v);
  if (!keepMonth){
    const now = new Date(), k = now.getFullYear()*12 + now.getMonth();
    const found = MONTHS.findIndex(g => g.key === k);
    MI = found >= 0 ? found : (k < MONTHS[0].key ? 0 : MONTHS.length - 1);
  }
  $('editbtn').classList.toggle('hidden', !(ROOT && ROOT.master && v === ROOT));
  $('pdfbtn').classList.toggle('hidden', v.view === 'v4' || v.view === 'v5');   // Ansichten 4 und 5: ohne PDF
  if (EDIT && v !== ROOT) EDIT = false;
  $('editbtn').classList.toggle('on', EDIT);
  renderNews(v); renderMonth(); renderYear(); renderTable(v); renderEditBar();
  $('lock').classList.add('hidden');
  $('app').classList.remove('hidden');
}

/* ---------- Ereignisse ---------- */
$('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeDetail(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDetail();
  if (V && TAB === 'month' && $('sheet').classList.contains('hidden')){ if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }
});
document.addEventListener('click', e => {
  const tb = e.target.closest('[data-tab]'); if (tb){ setTab(tb.dataset.tab); return; }
  const sv = e.target.closest('[data-view]');
  if (sv && ROOT){ closeDetail(); render(sv.dataset.view === 'ius' ? ROOT : ROOT.others[sv.dataset.view], true); return; }
  const md = e.target.closest('[data-mode]');
  if (md && V){ MODE = md.dataset.mode; store.set(MODE, modeKey(V.view));
    document.querySelectorAll('#modeseg button').forEach(b => b.classList.toggle('on', b.dataset.mode === MODE));
    RUNS = buildRuns(V); renderMonth(); renderYear(); return; }
  const gm = e.target.closest('[data-gm]'); if (gm){ MI = +gm.dataset.gm; renderMonth(); setTab('month'); return; }
  const r = e.target.closest('[data-i]');
  if (r && V){ if (EDIT && V === ROOT && TAB !== 'year') selectDay(+r.dataset.i); else openDetail(+r.dataset.i); return; }
  const rq = e.target.closest('[data-req]'); if (rq && V){ openRequest(+rq.dataset.req); return; }
  const act = e.target.closest('[data-act]'); if (act){ editAction(act.dataset.act); return; }
  const m = e.target.closest('[data-m]'); if (m) document.getElementById(m.dataset.m)?.scrollIntoView({behavior:'smooth', block:'start'});
});
$('pdfbtn').onclick = downloadPdf;
$('calbtn').onclick = () => openCal();
$('todaybtn').onclick = goToday;
$('reloadbtn').onclick = hardReload;
$('showpin').onclick = () => { const p = $('pin'); p.type = p.type === 'password' ? 'text' : 'password'; p.focus(); };
$('editbtn').onclick = () => { EDIT = !EDIT; SEL = null; SELSTEP = 0; if (EDIT) setTab('month'); render(ROOT, true); };
function doLogout(full){
  store.del();
  if (full) [TOKEN_KEY, TOKEN_EXP_KEY, AUTH_KEY, DRAFT_KEY, OWN_KEY].forEach(k => store.del(k));   // Q6: auf Wunsch alles vom Gerät entfernen (auch Server-Anmeldung)
  closeDetail(); V = null; ROOT = null; EDIT = false; $('editbar').classList.add('hidden'); document.body.classList.remove('withbar'); ['grid','month','year','newsbox'].forEach(x => $(x).innerHTML = ''); $('pin').value = '';
  $('app').classList.add('hidden'); $('lock').classList.remove('hidden'); $('lockmsg').textContent = full ? 'Abgemeldet – Anmeldung, Kalender-Zugang und Entwurf wurden von diesem Gerät entfernt.' : '';
}
$('logout').onclick = () => {
  const items = [store.get(AUTH_KEY) && 'die Anmeldung zum Speichern', store.get(TOKEN_KEY) && 'der Kalender-Zugang', store.get(DRAFT_KEY) && 'ein nicht veröffentlichter Entwurf'].filter(Boolean);
  if (!items.length) { doLogout(false); return; }
  $('sheetcard').innerHTML = `<h3>Abmelden</h3><p class="small">Auf diesem Gerät ist noch gespeichert: ${items.length > 1 ? items.slice(0, -1).join(', ') + ' und ' + items[items.length - 1] : items[0]}.</p><p class="small">Auf deinem eigenen Handy kannst du das lassen. Auf fremden oder geteilten Geräten bitte „Abmelden und alles von diesem Gerät entfernen“ wählen.</p>
    <div class="sheetbtns" style="flex-direction:column"><button class="btn" id="lo_only">Nur abmelden</button><button class="btn pri" id="lo_full">Abmelden und alles von diesem Gerät entfernen</button><button class="btn" data-act="close">Abbrechen</button></div>`;
  $('sheet').classList.remove('hidden');
  $('lo_only').onclick = () => doLogout(false); $('lo_full').onclick = () => doLogout(true);
};

function start(v){
  ROOT = v; initEdit(v); render(ROOT); setTab('month');
  if (ROOT.master) holeReisen();
  if (ROOT.master && ROOT.master.feeds) syncFeeds(PUB, false).then(() => { FEED_ERR = null; }).catch(e => { FEED_ERR = e; });
  const m = location.hash.match(/^#bearbeiten-(\d{8})-(\d{8})$/);       // Link aus einer Anfrage
  if (m && ROOT.master){
    const idx = s => ROOT.days.findIndex(d => d.d === `${s.slice(6,8)}.${s.slice(4,6)}.${s.slice(0,4)}`);
    const a = idx(m[1]), b = idx(m[2]);
    if (a >= 0 && b >= a){
      EDIT = true; SEL = [a, b]; SELSTEP = 2;
      MI = MONTHS.findIndex(g => a >= g.from && a <= g.to);
      render(ROOT, true); setTab('month');
    }
  }
  if (location.hash) try { history.replaceState(null, '', location.pathname + location.search); } catch(e){}
  if (OFFLINE) toast('Offline – angezeigt wird der zuletzt geladene Stand. Speichern ist erst wieder mit Internet möglich.');
  const tw = tokenWarning(); if (tw && ROOT.master) setTimeout(() => toast(tw), OFFLINE ? 3500 : 300);
}
$('lockform').addEventListener('submit', async e => {
  e.preventDefault();
  const pin = $('pin').value;
  if (!pin.trim()) return;
  $('go').disabled = true; $('lockmsg').style.color = 'var(--muted)'; $('lockmsg').textContent = 'Prüfe PIN …';
  try {
    const v = await unlock(pin);
    if (!v){ $('lockmsg').style.color = ''; $('lockmsg').textContent = 'PIN stimmt nicht.'; return; }
    if ($('remember').checked) store.set(norm(pin)); else store.del();
    $('lockmsg').textContent = '';
    start(v);
  } catch(err) {
    $('lockmsg').style.color = ''; $('lockmsg').textContent = 'Fehler beim Öffnen. Bitte Seite neu laden.';
  } finally { $('go').disabled = false; }
});

(async () => {
  if (!window.crypto || !crypto.subtle){
    $('lockmsg').textContent = 'Dieser Browser kann die Daten nicht entschlüsseln. Bitte einen aktuellen Browser verwenden.';
    $('go').disabled = true; return;
  }
  $('lockmsg').style.color = 'var(--muted)'; $('lockmsg').textContent = 'Lade Daten …'; $('go').disabled = true;
  try { VAULT = await loadVault(); $('lockmsg').textContent = ''; $('go').disabled = false; }
  catch(e){ $('lockmsg').style.color = ''; $('lockmsg').textContent = 'Daten konnten nicht geladen werden und auf diesem Gerät ist noch kein Stand gespeichert. Bitte Internetverbindung prüfen und neu laden.'; return; }
  if (STANDALONE) $('remember').checked = true;                    // als App auf dem Home-Bildschirm: Anmeldung merken
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){}
  const saved = store.get();
  if (saved){
    $('lockmsg').style.color = 'var(--muted)'; $('lockmsg').textContent = 'Öffne …';
    let v = null, unlockErr = false;
    try { v = await unlock(saved); } catch(e){ unlockErr = true; }
    if (v){
      $('lockmsg').textContent = '';
      try { start(v); } catch(e){ $('lockmsg').style.color = ''; $('lockmsg').textContent = 'Fehler beim Öffnen. Bitte Seite neu laden.'; $('app').classList.add('hidden'); $('lock').classList.remove('hidden'); }   // Q4: PIN bleibt gespeichert
      return;
    }
    if (unlockErr){ $('lockmsg').style.color = ''; $('lockmsg').textContent = 'Fehler beim Öffnen. Bitte Seite neu laden.'; return; }
    store.del(); $('lockmsg').textContent = 'Die gespeicherte PIN gilt nicht mehr. Bitte die neue PIN eingeben.';
  }
  $('pin').focus();
})();
