/* PatchworkPlanner – Oberfläche (ausgelagert aus index.html wegen Content-Security-Policy) */
let VAULT = null;
const LS_KEY = 'kinderplanung_pin';
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

const unlock = pin => PlannerCore.decryptVault(VAULT, pin);

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
function dayClass(view, d){
  if (view === 'v3') return MODE === 'frei' ? (d.s === 'I' ? 'fr' : '') : (d.s === 'M' ? 'on' : '');
  if (view === 'v2'){
    const s = bei(d,'I').length, h = 3 - s;
    if (MODE === 'da') return h === 3 ? 'on' : h ? 'kid' : '';
    return s === 3 ? 'fr' : s ? 'pf' : '';
  }
  if (/Männerurlaub/.test(d.a) && !bei(d,'I').length) return 'mu';
  if (iusFree(d)) return 'fr';
  return bei(d,'I').length ? 'kid' : '';
}
const LEGEND = () => ({
  v3:   MODE === 'frei' ? [['fr',`frei – ${NM.k4} bei ${NM.ius}`],['fe','Schulferien']] : [['on',`${NM.k4} bei dir`],['fe','Schulferien']],
  v2: MODE === 'da' ? [['on','Kinder bei dir'],['kid','einzelne Kinder bei dir'],['fe','Schulferien']]
                         : [['fr',`frei – Kinder bei ${NM.p1}`],['pf','teilweise frei'],['fe','Schulferien']],
  ius:     [['kid',`Kinder von ${NM.p1} da`],['fr','frei – ohne Kinder'],['mu','Männerurlaub'],['fe','Schulferien']]
});
/* Legende einklappbar (Standard: zu); Zustand bleibt beim Blättern erhalten */
let LEG_OPEN = false;
const legendBox = inner => `<details class="legbox"${LEG_OPEN ? ' open' : ''}><summary>Legende</summary>${inner}</details>`;
document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('legbox')){ LEG_OPEN = e.target.open;
  document.querySelectorAll('.legbox').forEach(x => { if (x !== e.target && x.open !== LEG_OPEN) x.open = LEG_OPEN; }); } }, true);
const ICONS_HELP = '🎂 Geburtstag · 🚗 Abholen/Bringen · • Termin · rote Zahl = Feiertag';

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
  } else {
    add(d => bei(d,'I').length > 0, d => bei(d,'I').length === 3 ? 'AMJ bei euch' : nameList(bei(d,'I')) + ' bei euch', 'kid');
    add(d => d.s === 'M', () => `${NM.k4} bei ${NM.v3}`, 'v3');
    add(iusFree, () => 'frei – ohne Kinder', 'fr');
    add(d => /Männerurlaub/.test(d.a), () => `Männerurlaub ${NM.p1}`, 'mu');
  }
  return out.sort((a,b) => a.from - b.from || a.to - b.to);
}

/* ================= Was ist neu ================= */
/* Jeder Eintrag erscheint pro Gerät und Ansicht (PIN) genau so lange, bis „Gelesen“ geklickt wurde. */
const newsId = c => c.d + '|' + c.text;
function seenSet(view){
  let ids = [];
  try { ids = JSON.parse(store.get('kinderplanung_gelesen_' + view) || '[]'); } catch(e){}
  const set = new Set(ids);
  const old = store.get('kinderplanung_gesehen_' + view);          // frühere Speicherart (Datum) übernehmen
  if (old) (V.changes || []).filter(c => c.iso <= old).forEach(c => set.add(newsId(c)));
  return set;
}
function renderNews(v){
  const key = 'kinderplanung_gelesen_' + v.view, firstVisit = store.get(key) === null && store.get('kinderplanung_gesehen_' + v.view) === null;
  const seen = seenSet(v.view);
  const twoWeeksAgo = new Date(Date.now() - 14*864e5).toISOString().slice(0,10);
  const fresh = (v.changes || []).filter(c => !seen.has(newsId(c)) && (!firstVisit || c.iso >= twoWeeksAgo)).reverse();
  if (!fresh.length){ $('newsbox').innerHTML = ''; return; }
  $('newsbox').innerHTML = `<div class="news" id="news"><h3>Was ist neu? <span class="badge">${fresh.length}</span></h3>
    <ul>${fresh.map((c,i) => `<li class="${i >= 3 ? 'more' : ''}">${esc(c.text)} <small>(${esc(c.d)})</small></li>`).join('')}</ul>
    <div class="btns"><button class="btn pri" id="seen">Gelesen</button>${fresh.length > 3 ? `<button class="btn" id="morenews">${fresh.length - 3} weitere</button>` : ''}<button class="btn" id="allchanges">Alle Änderungen</button></div></div>`;
  $('seen').onclick = () => {
    (v.changes || []).forEach(c => seen.add(newsId(c)));             // alles bis jetzt gilt als gelesen
    store.set(JSON.stringify([...seen]), key); store.del('kinderplanung_gesehen_' + v.view);
    $('newsbox').innerHTML = '';
  };
  if ($('morenews')) $('morenews').onclick = e => { $('news').classList.add('open'); e.target.remove(); };
  $('allchanges').onclick = () => showChanges(v);
}
function showChanges(v){
  const all = (v.changes || []).slice().reverse();
  $('sheetcard').innerHTML = `<h3>Alle Änderungen</h3><div class="sub">Neueste zuerst</div>
    ${all.length ? `<ul class="changelist">${all.map(c => `<li>${esc(c.text)} <small>(${esc(c.d)})</small></li>`).join('')}</ul>` : '<p>Noch keine Änderungen.</p>'}
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
function icons(d){
  let s = '';
  if (/Geburtstag/.test(d.a)) s += '🎂';
  if (d.u && d.u.some(u => u[2] !== 'visit')) s += '🚗';
  else if (d.u) s += '👋';
  if (!s && d.a && !d.h) s += '•';
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
    if (v.view === 'ius') ks = `<span class="ks">${[0,1,2].map(i => `<b class="${d.k[i]==='I'?'a':'x'}">${KINDER[i][0]}</b>`).join('')}<b class="${d.s==='I'?'s':'x'}">S</b></span>`;
    cells += `<div class="mc ${cls} ${d.f?'fe':''} ${d.h?'fei':''} ${d.d===todayStr?'today':''} ${editMark(idx)}" data-i="${idx}" title="${esc(d.a)}">
      <span class="n">${day}</span><span class="ic">${icons(d)}</span>${ks}</div>`;
  }
  // Liste: Zeiten, Abholen & Bringen, Termine
  const runs = RUNS.filter(r => r.to >= g.from && r.from <= g.to);
  const evs = []; for (let i = g.from; i <= g.to; i++) (D[i].u || []).forEach(u => evs.push([i, u]));
  const terms = [];
  for (let i = g.from; i <= g.to; i++) for (const part of (D[i].a || '').split(' · ').filter(Boolean)){
    const r = terms.find(x => x.text === part && x.to === i-1); if (r) r.to = i; else terms.push({ text:part, from:i, to:i });
  }
  terms.sort((a,b) => a.from - b.from);
  const zeitTitel = v.view === 'v3' ? (MODE === 'frei' ? 'Deine freien Tage' : `${NM.k4} bei dir`)
    : v.view === 'v2' ? (MODE === 'da' ? 'Kinder bei dir' : 'Deine freien Tage') : 'Wer ist wann da';
  $('month').innerHTML = `
    <div class="mhead"><button id="prevm" aria-label="Vorheriger Monat" ${MI===0?'disabled':''}>‹</button>
      <h2>${MONATE[g.m]} ${g.y}</h2>
      <button id="nextm" aria-label="Nächster Monat" ${MI===MONTHS.length-1?'disabled':''}>›</button></div>
    <div class="wdrow">${WDS.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="mgrid" id="mgrid">${cells}</div>
    ${legendBox(`<div class="legend">${LEGEND()[v.view].map(([c,t]) => `<span><i class="sw s-${c}"></i>${t}</span>`).join('')}
      ${v.view==='ius' ? `<span><i class="sw" style="background:var(--kA)"></i>${KINDER.map(k => k[0]).join(' ')}</span><span><i class="sw" style="background:var(--kS)"></i>${NM.k4} da</span>` : ''}</div>
    <div class="legend" style="margin-top:0">${ICONS_HELP}</div>`)}
    <div class="mlist">
      <h3>${zeitTitel}</h3>
      ${runs.length ? runs.map(r => `<div class="li"><i class="sw s-${r.cls}"></i><span><b>${rng(D, r.from, r.to)}</b> · ${esc(r.text)}</span></div>`).join('') : '<div class="empty">In diesem Monat nichts.</div>'}
      ${v.view !== 'v2' || evs.length ? `<h3>Abholen & Bringen</h3>
      ${evs.length ? evs.map(([i,u]) => `<div class="li"><span><b>${D[i].w} ${kd(D[i])}</b>${u[0] ? ` <span class="t">${esc(u[0])}</span>` : ''} · ${esc(u[1])}</span></div>`).join('') : '<div class="empty">In diesem Monat nichts.</div>'}` : ''}
      <h3>Termine & Feiertage</h3>
      ${terms.length ? terms.map(r => `<div class="li"><span><b>${rng(D, r.from, r.to)}</b> · ${esc(r.text)}</span></div>`).join('') : '<div class="empty">Keine.</div>'}
    </div>
    ${v.contact ? `<div style="text-align:center;margin-top:14px"><button class="btn pri" data-req="${g.from}">✉️ Änderung anfragen</button></div>` : ''}
    <p class="hint">Tippe auf einen Tag für Details · Wischen oder ‹ › für andere Monate</p>`;
  $('prevm').onclick = () => go(-1); $('nextm').onclick = () => go(1);
  let sx = null;
  $('mgrid').addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, {passive:true});
  $('mgrid').addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); sx = null; });
}
function go(step){ const n = MI + step; if (n < 0 || n >= MONTHS.length) return; MI = n; renderMonth(); }

/* ================= Jahr ================= */
function renderYear(){
  const v = V, D = v.days;
  $('year').innerHTML = `${legendBox(`<div class="legend">${LEGEND()[v.view].map(([c,t]) => `<span><i class="sw s-${c}"></i>${t}</span>`).join('')}<span>rote Zahl = Feiertag · unterstrichen = Geburtstag</span></div>`)}
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
        if (b.length) return [kurz(b), 'part'];
        if (/Männerurlaub/.test(d.a)) return ['Männerurl.','mu'];
        if (isWE(d) || d.h || /Urlaub |Silvester|Jahre /.test(d.a)) return ['IuS','ius'];
        return ['', 'none'];
      } },
    { head:NM.k4, cell: d => d.s === 'I' ? ['IuS','k4'] : [NM.v3[0],'v3'] }
  ],
  v2: [ { head:'Kinder', cell(d){ if (d.k === 'DDD') return ['AMJ','amj']; const b = bei(d,'D'); return b.length ? [kurz(b), 'part'] : ['', 'none']; } } ],
  v3: [ { head:NM.k4, cell: d => d.s === 'M' ? [NM.k4,'amj'] : ['', 'none'] } ]
});
const TLEGEND = () => ({
  ius: [['AMJ','amj','alle drei bei uns'],[KINDER[2],'part','nur einzelne Kinder'],['IuS','ius',`${NM.ius} ohne Kinder`],
        ['','mu',`Männerurlaub ${NM.p1}`],['IuS','k4',`${NM.k4} bei uns`],[NM.v3[0],'v3',`${NM.k4} bei ${NM.v3}`],['','ferien','Schulferien']],
  v2: [['AMJ','amj',`${KINDER.join(', ')} bei ${NM.p2}`],[KINDER[2],'part','nur einzelne Kinder'],['','ferien','Schulferien']],
  v3: [[NM.k4,'amj',`${NM.k4} bei ${NM.v3}`],['','ferien','Schulferien']]
});
function renderTable(v){
  $('tlegend').innerHTML = legendBox(`<div class="tleg">${TLEGEND()[v.view].map(([t,c,txt]) =>
    `<span><i class="tsw ${c==='ferien' ? '' : 'c-'+c}" style="${c==='ferien' ? 'background:var(--ferien)' : ''}">${esc(t)}</i>${esc(txt)}</span>`).join('')}</div>`);
  const tmpl = `2.1rem 1.7rem ${'4.1rem '.repeat(COLS()[v.view].length)}1fr`;
  const nowKey = new Date().getFullYear()*12 + new Date().getMonth();
  $('monthnav').innerHTML = MONTHS.map(g =>
    `<button data-m="m${g.key}" class="${g.key===nowKey?'now':''}">${MON_KURZ[g.m]}${g.y!==PLANYEAR ? ' '+String(g.y).slice(2) : ''}</button>`).join('');
  $('grid').innerHTML = MONTHS.map(g => {
    const idx = []; for (let i = g.from; i <= g.to; i++) idx.push(i);
    return `<article class="month" id="m${g.key}">
      <h3>${MONATE[g.m]} ${g.y}<small>${idx.length < 28 ? 'bis ' + v.days[g.to].d.slice(0,6) : ''}</small></h3>
      <div class="colhead" style="grid-template-columns:${tmpl}"><span>Tag</span><span></span>${COLS()[v.view].map(c => `<span>${c.head}</span>`).join('')}<span>Anlass</span></div>
      ${idx.map(i => { const d = v.days[i]; return `
        <div class="row ${isWE(d)?'we':''} ${d.d===todayStr?'today':''} ${editMark(i)}" data-i="${i}" style="grid-template-columns:${tmpl}">
          <span class="dn ${d.f?'fe':''} ${d.h?'fei':''}">${parseInt(d.d)}</span><span class="wt">${d.w}</span>
          ${COLS()[v.view].map(c => { const [t,cl] = c.cell(d); return `<span class="cell c-${cl}">${esc(t)}</span>`; }).join('')}
          <span class="an">${d.c ? '<i class="dot"></i>' : ''}${esc(d.a)}</span></div>`; }).join('')}
    </article>`; }).join('');
}

/* ================= Tagesdetails ================= */
function detailRows(v, d){
  if (v.view === 'ius') return [...KINDER.map((n,i) => [n, d.k[i] === 'I' ? 'bei uns' : `bei ${NM.p2}`]), [NM.k4, d.s === 'I' ? 'bei uns' : `bei ${NM.v3}`]];
  if (v.view === 'v2') return KINDER.map((n,i) => [n, d.k[i] === 'D' ? 'bei dir' : `bei ${NM.p1}`]);
  return [[NM.k4, d.s === 'M' ? 'bei dir' : `bei ${NM.ius}`]];
}
function openDetail(i){
  const d = V.days[i];
  $('sheetcard').innerHTML = `
    <h3>${d.w}, ${esc(d.d)}</h3>
    <div class="sub">KW ${d.kw}${d.f ? ' · Schulferien' : ''}${d.h ? ' · Feiertag' : ''}</div>
    <div class="kv">${detailRows(V, d).map(([k,val]) => `<span class="k">${esc(k)}</span><span>${esc(val)}</span>`).join('')}</div>
    ${d.u ? `<div class="kv">${d.u.map(u => `<span class="k">${u[0] ? esc(u[0]) : 'Übergabe'}</span><span>${esc(u[1])}</span>`).join('')}</div>` : ''}
    ${d.a ? `<div class="kv"><span class="k">Anlass</span><span>${esc(d.a)}</span></div>` : ''}
    ${d.c ? `<div class="note">${esc(d.c)}</div>` : ''}
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
const PC = { amj:rgb('#a3d68c'), part:rgb('#d9efc9'), ius:rgb('#d3c0ee'), pf:rgb('#ece4f8'), mu:rgb('#a9e2db'), k4:rgb('#c3dcf6'),
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
  if (view === 'v3') return [[22, MODE === 'frei' ? (d => d.s === 'I' ? ['frei', PC.ius] : ['', null]) : (d => d.s === 'M' ? [NM.k4, PC.amj] : ['', null])]];
  if (view === 'v2') return [[22, MODE === 'da'
    ? (d => { const h = bei(d,'D'); return h.length === 3 ? ['da', PC.amj] : h.length ? [ini(h), PC.part] : ['', null]; })
    : (d => { const s = bei(d,'I'); return s.length === 3 ? ['frei', PC.ius] : s.length ? [ini(s), PC.pf] : ['', null]; })]];
  return [
    [22, d => { const b = bei(d,'I');
      if (b.length === 3) return ['AMJ', PC.amj];
      if (b.length) return [ini(b), PC.part];
      if (/Männerurlaub/.test(d.a)) return ['MU', PC.mu];
      if (iusFree(d)) return ['IuS', PC.ius];
      return ['', null]; }],
    [11, d => d.s === 'I' ? [NM.k4[0], PC.k4] : [NM.v3[0], PC.v3]]
  ];
}
function pdfLegend(view){
  if (view === 'v3') return MODE === 'frei' ? [[PC.ius, `frei = ${NM.k4} bei ${NM.ius}`]] : [[PC.amj, `${NM.k4} = ${NM.k4} bei dir`]];
  if (view === 'v2') return MODE === 'da' ? [[PC.amj, 'da = alle drei bei dir'], [PC.part, 'Buchstaben = nur diese Kinder bei dir']]
    : [[PC.ius, `frei = Kinder bei ${NM.p1}`], [PC.pf, `Buchstaben = nur diese Kinder bei ${NM.p1}`]];
  return [[PC.amj, 'AMJ = alle drei da'], [PC.part, 'Buchstaben = nur diese Kinder'], [PC.ius, 'IuS = ohne Kinder'], [PC.mu, 'MU = Männerurlaub'],
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
/* PDF einer bestimmten Ansicht (mit deren Standard-Hervorhebung, wenn nicht die eigene) */
function pdfFile(v){
  const keep = MODE;
  if (v !== V && MODE_DEFAULT[v.view]) MODE = MODE_DEFAULT[v.view];
  try { return new File([buildPdf(v)], `Kinderplanung_${v.label.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`, { type:'application/pdf' }); }
  finally { MODE = keep; }
}
function saveFile(file){
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function sharePdf(v){
  const file = pdfFile(v);
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
  if (!(V === ROOT && ROOT.others)) { saveFile(pdfFile(V)); return; }
  const draftNote = CHG.size ? '<p class="small" style="color:#a35400">Hinweis: Die PDFs enthalten nur den veröffentlichten Stand, nicht euren offenen Entwurf.</p>' : '';
  const pub = PUB ? PlannerCore.deriveViews(PUB) : { ius: ROOT, v2: ROOT.others.v2, v3: ROOT.others.v3 };   // nie den Entwurf verschicken
  const who = [['ius', pub.ius, NM.ius], ['v2', pub.v2, NM.p2], ['v3', pub.v3, NM.v3]];
  $('sheetcard').innerHTML = `<h3>PDF</h3><div class="sub">Zweiseitiger Jahresplan zum Drucken oder Verschicken – jeweils nur mit dem, was die Person sehen soll.</div>
    ${who.map(([k, v, n]) => `<div class="pdfrow"><b>${esc(n)}</b><span>
      <button class="btn" data-pdf="${k}" data-how="dl">Herunterladen</button>
      ${k !== 'ius' ? `<button class="btn pri" data-pdf="${k}" data-how="share">Per Mail / WhatsApp senden</button>` : ''}</span></div>`).join('')}
    ${draftNote}
    <p class="small">„Senden“ öffnet am Handy das Teilen-Menü (Mail, WhatsApp …) mit dem PDF als Anhang. Am Computer wird das PDF gespeichert und das Mailprogramm geöffnet – dort das PDF anhängen.</p>
    <button id="closesheet">Schließen</button>`;
  $('sheet').classList.remove('hidden'); $('closesheet').onclick = closeDetail;
  $('sheetcard').querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => {
    const v = who.find(w => w[0] === b.dataset.pdf)[1];
    if (b.dataset.how === 'share') sharePdf(v); else saveFile(pdfFile(v));
  });
}


/* ================= Laden & Bearbeiten (nur Hauptansicht) ================= */
const CACHE_KEY = 'kinderplanung_cache', DRAFT_KEY = 'kinderplanung_entwurf', TOKEN_KEY = 'kinderplanung_schreibzugang', TOKEN_EXP_KEY = 'kinderplanung_zugang_bis';
/* Hinweis, wenn der Schreibzugang bald abläuft (N5) */
function tokenWarning(){
  const exp = store.get(TOKEN_EXP_KEY);
  if (!exp || !store.get(TOKEN_KEY)) return '';
  const days = Math.round((new Date(exp) - new Date()) / 864e5);
  if (days > 30) return '';
  return days < 0 ? 'Der Schreibzugang auf diesem Gerät ist abgelaufen – bitte bei GitHub neu erzeugen.'
                  : `Der Schreibzugang auf diesem Gerät läuft in ${days} Tagen ab – bitte rechtzeitig bei GitHub verlängern („Regenerate token“).`;
}
let OFFLINE = false;
async function loadVault(){
  let cached = null;
  try { cached = JSON.parse(store.get(CACHE_KEY) || 'null'); } catch(e){}
  let v;
  try {
    const r = await fetch('data.json?ts=' + Date.now(), { cache:'no-store' });
    if (!r.ok) throw new Error('data.json ' + r.status);
    v = await r.json();
  } catch(e){
    if (cached && cached.blobs){ OFFLINE = true; return cached; }   // ohne Netz: zuletzt geladenen Stand verwenden
    throw e;
  }
  // eigener, gerade veröffentlichter Stand kann neuer sein als die (noch nicht aktualisierte) Webseite
  if (cached && cached.blobs && PlannerCore.revNum(cached) > PlannerCore.revNum(v)) v = cached;
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
  const block = (id, title, lines, d, m, hint) => !lines.length ? '' : `<div class="pubbox">
      <b>${title}</b><ul class="difflist">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <label class="small" for="t_${id}">Text für „Was ist neu?“ (leer = kein Eintrag)</label>
      <textarea id="t_${id}">${esc(lines.join('; ') + '.')}</textarea>
      <div class="who2"><label><input type="checkbox" checked disabled> ${esc(NM.ius)}</label>
        <label><input type="checkbox" id="d_${id}" ${d ? 'checked' : ''}> ${esc(NM.p2)}</label>
        <label><input type="checkbox" id="m_${id}" ${m ? 'checked' : ''}> ${esc(NM.v3)}</label></div>
      ${hint ? `<p class="small">${hint}</p>` : ''}</div>`;
  $('sheetcard').innerHTML = `<h3>Veröffentlichen</h3><div class="sub">Das ändert sich – danach sehen es alle nach etwa einer Minute.</div>
    ${block('amj', 'Kinder von ' + NM.p1, c.amj, true, false, '')}
    ${block('k4', NM.k4, c.k4, false, true, '')}
    ${block('other', 'Anlässe und Notizen', c.other, false, false, 'Notizen sehen nur ihr. Anlässe erscheinen bei den anderen nur, wenn sie für sie gedacht sind (z. B. Feiertage, Geburtstage).')}
    <div class="sheetbtns"><button class="btn pri" id="dopub">Jetzt veröffentlichen</button><button class="btn" data-act="close">Abbrechen</button></div>
    <div class="msg" id="pubmsg"></div>`;
  $('sheet').classList.remove('hidden');
  ['d_other', 'm_other'].forEach(id => $(id) && $(id).addEventListener('change', () => {
    const on = ($('d_other') && $('d_other').checked) || ($('m_other') && $('m_other').checked);
    let w = $('warn_other');
    if (on && !w){ w = document.createElement('p'); w.id = 'warn_other'; w.className = 'small'; w.style.color = '#a35400';
      w.textContent = 'Achtung: Dieser Text nennt Anlässe/Notizen, die die angehakte Person sonst nicht sieht. Bitte prüfen und ggf. neutral formulieren.';
      $('t_other').after(w); }
    if (!on && w) w.remove();
  }));
  $('dopub').onclick = () => doPublish(['amj', 'k4', 'other'].filter(g => $('t_' + g)).map(g => ({
    text: $('t_' + g).value.trim(), wer: 'I' + ($('d_' + g).checked ? 'D' : '') + ($('m_' + g).checked ? 'M' : '') })).filter(x => x.text));
}

/* --- Speichern bei GitHub --- */
const ghHeaders = token => ({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

/* Speichert neue Stammdaten als data.json bei GitHub. Wirft {kind:'token'|'conflict'} oder Error. */
async function commitMaster(master, message){
  const token = store.get(TOKEN_KEY);
  if (!token) throw { kind:'token' };
  const h = ghHeaders(token), api = `https://api.github.com/repos/${PUB.repo}/contents/data.json`;
  const cur = await fetch(api + '?ref=main&ts=' + Date.now(), { headers: h, cache: 'no-store' });
  if (cur.status === 401 || cur.status === 403 || cur.status === 404) throw { kind:'token' };
  if (!cur.ok) throw new Error('GitHub antwortet nicht (' + cur.status + ')');
  const meta = await cur.json();
  let remote;
  if (meta.content) remote = JSON.parse(atob(String(meta.content).replace(/\s/g, '')));
  else {                                              // Dateien > 1 MB liefert GitHub nur über die Rohdaten-Adresse
    const raw = await fetch(meta.download_url, { cache:'no-store' });
    if (!raw.ok) throw new Error('GitHub antwortet nicht (' + raw.status + ')');
    remote = await raw.json();
  }
  if (remote.rev !== VAULT.rev) throw { kind:'conflict' };   // nur exakt der Stand, auf dem bearbeitet wurde
  const vault = await PlannerCore.buildVault(master, ROOT.keys, VAULT.salt, VAULT.iter, PlannerCore.revNum(remote) + 1);
  const put = await fetch(api, { method:'PUT', headers: { ...h, 'Content-Type':'application/json' },
    body: JSON.stringify({ message, content: btoa(JSON.stringify(vault)), sha: meta.sha, branch:'main',
      // neutrale Absenderangabe, damit keine private E-Mail-Adresse in der öffentlichen Historie landet
      author: { name: PUB.repo.split('/')[0], email: PUB.repo.split('/')[0] + '@users.noreply.github.com' },
      committer: { name: PUB.repo.split('/')[0], email: PUB.repo.split('/')[0] + '@users.noreply.github.com' } }) });
  if (put.status === 409 || put.status === 422) throw { kind:'conflict' };
  if (put.status === 401 || put.status === 403 || put.status === 404) throw { kind:'token' };
  if (!put.ok) throw new Error('Speichern fehlgeschlagen (' + put.status + ')');
  // neuen Stand übernehmen, offenen Entwurf (falls vorhanden) auf den neuen Stand übertragen
  const pending = {}; CHG.forEach(i => { pending[DRAFT.rows[i].d] = DRAFT.rows[i]; });
  VAULT = vault; store.set(JSON.stringify(vault), CACHE_KEY);
  const vs = PlannerCore.deriveViews(master);
  ROOT = Object.assign(vs.ius, { master, keys: ROOT.keys });
  PUB = clone(master); DRAFT = clone(master);
  DRAFT.rows.forEach((r, i) => { if (pending[r.d]) DRAFT.rows[i] = clone(pending[r.d]); });
  applyDraft();
  let feedError = null;                               // Kalender gleich mit aktualisieren; Fehler melden statt verschlucken
  try { await syncFeeds(master, true); FEED_ERR = null; } catch(e){ feedError = e; FEED_ERR = e; }
  return { vault, feedError };
}
let FEED_ERR = null;
const feedErrText = e => e && e.kind === 'gist' ? 'dem Schreibzugang fehlt das Recht „Gists: Read and write“'
  : e && e.kind === 'token' ? 'der Schreibzugang ist ungültig oder abgelaufen' : 'GitHub war nicht erreichbar';
function publishError(err, say){
  if (err && err.kind === 'token') say(`Der Schreibzugang auf diesem Gerät fehlt, ist abgelaufen oder hat nicht die nötigen Rechte. <a href="#" data-act="token">Schreibzugang einrichten</a>`, 'err');
  else if (err && err.kind === 'gist') say(`Für die Kalender-Links fehlt dem Schreibzugang das Recht „Gists: Read and write“ (bei GitHub im Token unter „Account permissions“ ergänzen).`, 'err');
  else if (err && err.kind === 'conflict') say(`Der Plan wurde inzwischen an anderer Stelle geändert. <a href="#" data-act="reload">Seite neu laden</a> – dein Entwurf wird dabei übernommen.`, 'err');
  else if (err && /^Daten fehlerhaft/.test(err.message || '')) say(esc(err.message), 'err');
  else say(esc(err && err.message || 'Unbekannter Fehler') + ' – bitte Internetverbindung prüfen und erneut versuchen.', 'err');
}
async function doPublish(entries){
  if (!store.get(TOKEN_KEY)){ openTokenSheet(true); return; }
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
    master.changes.forEach(c => seen.includes(c.d + '|' + c.text) || seen.push(c.d + '|' + c.text)); store.set(JSON.stringify(seen), seenKey);
    EDIT = false; SEL = null; NOTICE = '';
    $('sheetcard').innerHTML = `<h3>Gespeichert ✓</h3><p>Die Änderungen sind veröffentlicht. Für ${esc(NM.p2)} und ${esc(NM.v3)} sind sie in etwa einer Minute sichtbar${PUB.feeds && !res.feedError ? ', in den abonnierten Kalendern je nach App nach einigen Stunden' : ''}.</p>
      ${PUB.feeds && res.feedError ? `<p class="msg err">Die abonnierten Kalender konnten nicht aktualisiert werden: ${esc(feedErrText(res.feedError))}. Bitte später unter „📅 Kalender“ → „Kalender jetzt aktualisieren“ erneut versuchen.</p>` : ''}
      ${entries.some(e => e.wer.includes('D')) ? `<button class="btn" style="width:100%;margin-top:8px" data-sendpdf="v2">📄 Aktuelles PDF an ${esc(NM.p2)} schicken</button>` : ''}
      ${entries.some(e => e.wer.includes('M')) ? `<button class="btn" style="width:100%;margin-top:8px" data-sendpdf="v3">📄 Aktuelles PDF an ${esc(NM.v3)} schicken</button>` : ''}
      <div class="sheetbtns"><button class="btn pri" data-act="close">Schließen</button></div>`;
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
  for (const v of ['ius', 'v2', 'v3']) if (F[v])
    await gistCall('/' + F[v].id, 'PATCH', { description: desc, files: { [ICS_FILE]: { content: PlannerCore.buildICS(vs[v]) } } });
  return 'updated';
}
async function newGist(view, vs){
  const g = await gistCall('', 'POST', { description: feedDesc(), public: false, files: { [ICS_FILE]: { content: PlannerCore.buildICS(vs[view]) } } });
  return { id: g.id, raw: `https://gist.githubusercontent.com/${g.owner.login}/${g.id}/raw/${ICS_FILE}` };
}
async function setupFeeds(say){
  say('Richte Kalender-Links ein …');
  try {
    const vs = PlannerCore.deriveViews(PUB), feeds = {};
    for (const v of ['ius', 'v2', 'v3']) feeds[v] = await newGist(v, vs);
    const d = todayDE(), [dd, mm, yy] = d.split('.');
    const master = clone(PUB); master.feeds = feeds;
    master.changes = [...PUB.changes, { d, iso: `${yy}-${mm}-${dd}`, wer: 'IDM', text: 'Neu: Knopf „Kalender“ – den Plan im eigenen Kalender abonnieren (Outlook, iPhone, Apple, Google); aktualisiert sich von selbst.' }];
    const res = await commitMaster(master, 'Kalender-Links eingerichtet');
    render(ROOT, true); openCal(res.feedError ? null : 'Kalender-Links eingerichtet.');
  } catch(err){ publishError(err, say); }
}
async function renewFeed(view, say){
  say('Erzeuge neuen Link …');
  try {
    const old = PUB.feeds[view];
    const master = clone(PUB);
    master.feeds[view] = await newGist(view, PlannerCore.deriveViews(PUB));
    await commitMaster(master, 'Kalender-Link erneuert');                 // Kalenderfehler zeigt das Kalender-Fenster
    try { await gistCall('/' + old.id, 'DELETE'); } catch(e){}
    render(ROOT, true); openCal(`Neuer Link erzeugt. Der alte funktioniert nicht mehr – bitte neu abonnieren${view === 'ius' ? '' : ' bzw. den neuen Link weitergeben'}.`);
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
    h += `<p>Das Kalender-Abo ist noch nicht eingerichtet.</p>`;
  } else {
    h += `<p class="small">Noch keine Kalender-Links vorhanden. Beim Einrichten entstehen drei geheime Links – für euch, für ${esc(NM.p2)} und für ${esc(NM.v3)}. Jede Person sieht darin nur ihre eigene Ansicht.</p>
      <p class="small">Voraussetzung: Schreibzugang auf diesem Gerät mit dem Recht „Gists: Read and write“.</p>
      <button class="btn pri" style="width:100%;padding:11px" id="calsetup">Kalender-Links einrichten</button>`;
  }
  if (isRoot && feeds){
    h += `<h4 style="margin:18px 0 6px">Links der anderen</h4><p class="small">Sehen ${esc(NM.p2)} und ${esc(NM.v3)} auch selbst in ihrer Ansicht unter „Kalender“.</p>
      ${['v2', 'v3'].map(v => `<div style="margin:8px 0"><b>${esc(v === 'v2' ? NM.p2 : NM.v3)}</b>${copyRow(feeds[v].raw, v)}</div>`).join('')}
      <details class="howto"><summary>Link ungültig machen und neu erzeugen</summary>
        <p class="small">Falls ein Link in falsche Hände geraten ist. Wer ihn abonniert hat, muss danach neu abonnieren.</p>
        <div class="quick">${['ius', 'v2', 'v3'].map(v => `<button class="btn" data-renew="${v}">${esc(v === 'ius' ? NM.ius : v === 'v2' ? NM.p2 : NM.v3)}</button>`).join('')}</div></details>
      <p class="small" id="calstate">Prüfe Stand der Kalender …</p>
      <button class="btn" style="width:100%;margin-top:8px" id="calsync">Kalender jetzt aktualisieren</button>`;
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
  if ($('calsetup')) $('calsetup').onclick = () => store.get(TOKEN_KEY) ? setupFeeds(say) : openTokenSheet(false);
  const showState = async () => {
    if (!$('calstate')) return;
    if (!store.get(TOKEN_KEY)){ $('calstate').textContent = 'Stand der Kalender nur mit Schreibzugang auf diesem Gerät prüfbar.'; return; }
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
}

/* --- Schreibzugang (einmal pro Gerät) --- */
function openTokenSheet(thenPublish){
  const has = !!store.get(TOKEN_KEY);
  $('sheetcard').innerHTML = `<h3>Schreibzugang einrichten</h3>
    <p class="small">Einmal pro Gerät nötig. Der Zugang wird nur auf diesem Gerät gespeichert und erlaubt nur, den Plan zu speichern.</p>
    <ol class="steps">
      <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Diesen Link öffnen</a> und bei GitHub anmelden.</li>
      <li><b>Token name</b>: z. B. „Planer ${esc(navigator.platform || 'Gerät')}“. <b>Expiration</b>: „Custom“ und ein Datum in einem Jahr.</li>
      <li><b>Repository access</b>: „Only select repositories“ → <b>${esc((PUB.repo || '').split('/')[1] || '')}</b> auswählen.</li>
      <li><b>Permissions</b> → „Add permissions“ bzw. „Repository permissions“ → <b>Contents</b> auf „Read and write“.</li>
      <li>Für die Kalender-Abos zusätzlich bei <b>Account permissions</b> → <b>Gists</b> auf „Read and write“.</li>
      <li>Ganz unten <b>Generate token</b> → den Code (beginnt mit „github_pat_“) kopieren und hier einfügen.</li>
    </ol>
    <input id="tok" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="github_pat_…">
    <label class="small" for="tokexp" style="display:block;margin-top:10px">Gültig bis (wie bei GitHub unter „Expiration“ eingestellt) – die Seite erinnert rechtzeitig:</label>
    <input id="tokexp" type="date" value="${esc(store.get(TOKEN_EXP_KEY) || '')}" style="font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:10px">
    <div class="sheetbtns"><button class="btn pri" id="savetok">Prüfen und speichern</button><button class="btn" data-act="close">Abbrechen</button></div>
    ${has ? '<p class="small"><a href="#" id="deltok">Schreibzugang auf diesem Gerät entfernen</a></p>' : ''}
    <div class="msg" id="tokmsg"></div>`;
  $('sheet').classList.remove('hidden');
  if ($('deltok')) $('deltok').onclick = e => { e.preventDefault(); store.del(TOKEN_KEY); store.del(TOKEN_EXP_KEY); $('tokmsg').className = 'msg ok'; $('tokmsg').textContent = 'Entfernt.'; };
  $('savetok').onclick = async () => {
    const tok = $('tok').value.trim(), m = $('tokmsg');
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(tok)){ m.className = 'msg err'; m.textContent = 'Das sieht nicht wie ein GitHub-Zugangscode aus (beginnt mit „github_pat_“).'; return; }
    m.className = 'msg'; m.textContent = 'Prüfe …';
    try {
      const r = await fetch(`https://api.github.com/repos/${PUB.repo}/contents/data.json?ref=main`, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' }, cache:'no-store' });
      if (!r.ok){ m.className = 'msg err'; m.textContent = r.status === 404 ? 'Kein Zugriff auf den Speicher – ist „PatchworkPlanner“ ausgewählt?' : 'Code wurde nicht akzeptiert (' + r.status + ').'; return; }
      store.set(tok, TOKEN_KEY);
      // Ablaufdatum: von GitHub, falls lesbar, sonst die Eingabe
      const hdr = r.headers.get('github-authentication-token-expiration');
      const exp = hdr ? new Date(hdr.replace(' UTC', 'Z').replace(' ', 'T')).toISOString().slice(0,10) : $('tokexp').value;
      if (exp) store.set(exp, TOKEN_EXP_KEY); else store.del(TOKEN_EXP_KEY);
      m.className = 'msg ok'; m.textContent = 'Gespeichert ✓';
      if (thenPublish && CHG.size) setTimeout(openPublishSheet, 600);
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
    const opts = [['ius', ROOT], ['v2', ROOT.others.v2], ['v3', ROOT.others.v3]];
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
$('logout').onclick = () => { store.del(); V = null; ROOT = null; EDIT = false; $('editbar').classList.add('hidden'); document.body.classList.remove('withbar'); ['grid','month','year','newsbox'].forEach(x => $(x).innerHTML = ''); $('pin').value = '';
  $('app').classList.add('hidden'); $('lock').classList.remove('hidden'); $('lockmsg').textContent = ''; };

function start(v){
  ROOT = v; initEdit(v); render(ROOT); setTab('month');
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
    let failed = false;
    try { const v = await unlock(saved); if (v){ $('lockmsg').textContent = ''; start(v); return; } failed = true; } catch(e){}
    store.del(); $('lockmsg').textContent = failed ? 'Die gespeicherte PIN gilt nicht mehr. Bitte die neue PIN eingeben.' : '';
  }
  $('pin').focus();
})();
