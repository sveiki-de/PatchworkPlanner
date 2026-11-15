/* PatchworkPlanner – gemeinsame Logik für Browser und Node:
   Ansichten aus den Stammdaten ableiten (Filter, Abholen & Bringen) und verschlüsseln.
   Enthält bewusst keine Namen oder Orte – die stehen nur in den verschlüsselten Stammdaten. */
(function (root) {
  'use strict';
  const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const FEIERTAGE = ['Neujahr', 'Heilige Drei Könige', 'Karfreitag', 'Ostern (AMJ ab Mittag)', 'Ostermontag', 'Tag der Arbeit',
    'Christi Himmelfahrt', 'Pfingsten', 'Pfingstmontag', 'Fronleichnam', 'Mariä Himmelfahrt', 'Tag der Dt. Einheit',
    'Allerheiligen', '1. Weihnachtstag', '2. Weihnachtstag'];
  const ALLGEMEIN = ['Rosenmontag', 'Muttertag', 'Halloween', 'Buß- und Bettag', '1. Advent', 'Heiligabend', 'Silvester'];
  const VIEWS = ['ius', 'v2', 'v3', 'v4', 'v5'];

  const parts = s => s ? String(s).split(' · ').map(x => x.trim()).filter(Boolean) : [];
  const parseDate = s => { const [d, m, y] = s.split('.').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fmt = dt => `${String(dt.getUTCDate()).padStart(2, '0')}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}.${dt.getUTCFullYear()}`;
  const isoWeek = dt => { const t = new Date(dt); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7); };

  /* Stammdaten prüfen: lückenlose Tage, gültige Werte */
  function validate(master) {
    const err = [];
    if (!master || !Array.isArray(master.rows) || !master.rows.length) return ['Keine Tage vorhanden'];
    let prev = null;
    master.rows.forEach((r, i) => {
      if (!/^\d\d\.\d\d\.\d{4}$/.test(r.d)) err.push(`Zeile ${i + 1}: Datum „${r.d}“ ungültig`);
      if (!/^[ID]{3}$/.test(r.k)) err.push(`${r.d}: AMJ „${r.k}“ ungültig`);
      if (!/^[IM]$/.test(r.s)) err.push(`${r.d}: Kind 4 „${r.s}“ ungültig`);
      if (r.x && !/^(V|A|B|VB|AB)$/.test(r.x)) err.push(`${r.d}: Übergabe „${r.x}“ ungültig`);
      const dt = parseDate(r.d);
      if (prev && dt - prev !== 864e5) err.push(`${r.d}: Lücke oder doppelter Tag`);
      prev = dt;
    });
    if (master.hist && !Array.isArray(master.hist)) err.push('Verlauf ungültig');
    (master.hist || []).forEach((h, i) => { if (!h || !/^\d\d\.\d\d\.\d{4}$/.test(h.d || '') || !/^\d\d\.\d\d\.\d{4}$/.test(h.t || '')) err.push(`Verlauf ${i + 1} ungültig`); });
    (master.changes || []).forEach((c, i) => { if (!/^[IDMLS]+$/.test(c.wer || '') || !c.text) err.push(`Änderung ${i + 1} ungültig`); });
    return err;
  }

  /* Drei Ansichten aus den Stammdaten ableiten */
  function deriveViews(master) {
    const N = master.names, P = master.places || {};
    const list = master.rows.map(r => ({ date: parseDate(r.d), f: !!r.f, amj: r.k, k4: r.s, anlass: r.a || '', kommentar: r.c || '', x: r.x || '' }));
    const isFeiertag = d => parts(d.anlass).some(x => FEIERTAGE.includes(x));
    const kidBirthdays = N.kids.map(k => `${k} Geburtstag`);

    const filterD = x => {
      if (x === 'Fasching/Ball') return 'Fasching';
      if (x === 'Ostern (AMJ ab Mittag)') return x;
      if (FEIERTAGE.includes(x) || ALLGEMEIN.includes(x) || x === 'Fasching' || x === 'MiniRo' || x.startsWith('Papa-Kind-WE') || x.startsWith('Mama-Kind-WE')) return x;
      if (x === `${N.p2} Geburtstag`) return 'Dein Geburtstag';
      if (kidBirthdays.includes(x) || x === `AMJ fahren zu ${N.p2} zurück`) return x;
      return null;
    };
    const filterM = x => {
      if (x === 'Fasching/Ball') return 'Fasching';
      if (x === 'Ostern (AMJ ab Mittag)') return 'Ostern';
      if (x === `${N.v3} Geburtstag`) return 'Dein Geburtstag';
      if (FEIERTAGE.includes(x) || ALLGEMEIN.includes(x) || x === 'Fasching' || x === `${N.k4} Geburtstag` || (N.k5 && x === `${N.k5} Geburtstag`)) return x;
      return null;
    };
    const filterL = x => {                                                // v4: Feiertage, allgemeine Tage, Geburtstage der Kinder
      if (x === 'Fasching/Ball') return 'Fasching';
      if (x === 'Ostern (AMJ ab Mittag)') return 'Ostern';
      if (N.k5 && x === `${N.k5} Geburtstag`) return 'Dein Geburtstag';
      if (FEIERTAGE.includes(x) || ALLGEMEIN.includes(x) || x === 'Fasching' || kidBirthdays.includes(x) || x === `${N.k4} Geburtstag`) return x;
      return null;
    };
    const filterS = x => {                                                // v5: wie v4, eigener Geburtstag als „Dein Geburtstag“
      if (x === 'Fasching/Ball') return 'Fasching';
      if (x === 'Ostern (AMJ ab Mittag)') return 'Ostern';
      if (x === `${N.k4} Geburtstag`) return 'Dein Geburtstag';
      if (FEIERTAGE.includes(x) || ALLGEMEIN.includes(x) || x === 'Fasching' || kidBirthdays.includes(x) || (N.k5 && x === `${N.k5} Geburtstag`)) return x;
      return null;
    };
    const changesFor = c => (master.changes || []).filter(x => x.wer.includes(c)).map(({ d, iso, text }) => ({ d, iso, text }));

    // Abholen & Bringen aus Regeln; Ausnahmen = „Zeit nach Absprache“
    const ev = { ius: list.map(() => []), v2: list.map(() => []), v3: list.map(() => []), v5: list.map(() => []) };
    const kidsTxt = (idx, view) => idx.length === 3 ? (view === 'v2' ? 'die Kinder' : 'AMJ') : idx.map(i => N.kids[i]).join(' & ');
    const wdOf = d => WT[d.date.getUTCDay()];
    const addAMJ = (i, t, f) => { ev.ius[i].push([t, f('ius'), 'amj']); ev.v2[i].push([t, f('v2'), 'amj']); };
    for (let i = 0; i < list.length; i++) {
      const d = list[i], p = list[i - 1], nx = list[i + 1];
      if (p) {
        const arr = [0, 1, 2].filter(j => d.amj[j] === 'I' && p.amj[j] === 'D');
        if (arr.length) {
          // reines Kinder-WE (nur Sa+So bei Sven, Mo wieder bei Daniela): Abholen am Freitag, auch in den Ferien
          const pureWE = list[i + 1] && list[i + 2] && wdOf(list[i + 1]) === 'So' && arr.every(j => list[i + 1].amj[j] === 'I' && list[i + 2].amj[j] === 'D');
          // Ausnahmen (Feld x): V = Abholung am Vorabend, A = Sven holt am Tag selbst ab (Zeit nach Absprache)
          if (d.x.includes('V')) addAMJ(i - 1, 'abends', v => `${N.p1} holt ${kidsTxt(arr, v)} ab`);
          else if (d.x.includes('A')) addAMJ(i, '', v => `${N.p1} holt ${kidsTxt(arr, v)} ab (Zeit nach Absprache)`);
          else if (wdOf(d) === 'Sa' && wdOf(p) === 'Fr' && ((!d.f && !p.f) || pureWE)) addAMJ(i - 1, 'abends', v => `${N.p1} holt ${kidsTxt(arr, v)} ab`);
          else addAMJ(i, '', v => `${kidsTxt(arr, v)} ${arr.length > 1 ? 'kommen' : 'kommt'} zu ${N.p1} (Zeit nach Absprache)`);
        }
      }
      if (nx) {
        const dep = [0, 1, 2].filter(j => d.amj[j] === 'I' && nx.amj[j] === 'D');
        if (dep.length) {
          if (d.x.includes('B')) addAMJ(i, '', v => `${N.p1} bringt ${kidsTxt(dep, v)} zurück (Zeit nach Absprache)`);   // Ausnahme B: Sven bringt zurück
          else if (wdOf(d) === 'So' && !d.f && !nx.f) addAMJ(i, '17:00', v => `${N.p1} bringt ${kidsTxt(dep, v)} zurück`);
          else addAMJ(i, '', v => `${kidsTxt(dep, v)} zurück zu ${v === 'v2' ? 'dir' : N.p2} (Zeit nach Absprache)`);
        }
        // Freitags-Besuche werden bewusst nicht mehr eingetragen (Entscheidung 10.11.2026).
      }
      if (p && d.k4 === 'M' && p.k4 === 'I') {
        let j = i; while (j + 1 < list.length && list[j + 1].k4 === 'M') j++;
        if (wdOf(d) === 'Sa' && j === i + 1 && wdOf(p) === 'Fr' && !p.f) {
          ev.ius[i - 1].push(['nach der Schule', `${N.k4} fährt zu ${N.v3}`, 'k4']);
          ev.v3[i - 1].push(['nach der Schule', `${N.k4} fährt zu dir`, 'k4']);
          ev.v5[i - 1].push(['nach der Schule', `Du fährst zu ${N.v3}`, 'k4']);
          ev.ius[j].push(['gegen Mittag', `${N.k4} fährt zurück${P.pickup ? ', Abholung ' + P.pickup + ' am späten Nachmittag' : ''}`, 'k4']);
          ev.v3[j].push(['gegen Mittag', `${N.k4} fährt zurück`, 'k4']);
          ev.v5[j].push(['gegen Mittag', `Du fährst zurück zu ${N.ius}`, 'k4']);
        } else {
          ev.ius[i].push(['', `${N.k4} fährt zu ${N.v3} (Zeit nach Absprache)`, 'k4']);
          ev.v3[i].push(['', `${N.k4} fährt zu dir (Zeit nach Absprache)`, 'k4']);
          ev.v5[i].push(['', `Du fährst zu ${N.v3} (Zeit nach Absprache)`, 'k4']);
          if (j + 1 < list.length) {
            ev.ius[j].push(['', `${N.k4} fährt zurück (Zeit nach Absprache)`, 'k4']);
            ev.v3[j].push(['', `${N.k4} fährt zurück (Zeit nach Absprache)`, 'k4']);
            ev.v5[j].push(['', `Du fährst zurück zu ${N.ius} (Zeit nach Absprache)`, 'k4']);
          }
        }
      }
    }
    const withEv = (view, i, o) => ev[view][i].length ? { ...o, u: ev[view][i] } : o;
    const base = d => ({ d: fmt(d.date), w: WT[d.date.getUTCDay()], kw: isoWeek(d.date), f: d.f ? 1 : 0, h: isFeiertag(d) ? 1 : 0 });
    // N1: jede Ansicht bekommt nur die Namen, die sie für die Anzeige braucht
    const names = { kids: N.kids, k4: N.k4, p1: N.p1, ius: N.ius, p2: N.p2, v3: N.v3, k5: N.k5 };
    const namesV2 = { kids: N.kids, p1: N.p1, p2: N.p2 };
    const namesV3 = { k4: N.k4, p1: N.p1, ius: N.ius, v3: N.v3 };
    const namesV4 = { kids: N.kids, k4: N.k4, p1: N.p1, ius: N.ius, p2: N.p2, v3: N.v3, k5: N.k5 };
    const namesV5 = { kids: N.kids, k4: N.k4, ius: N.ius, p2: N.p2, v3: N.v3 };
    const views = {
      ius: { view: 'ius', label: N.ius, stand: master.stand, names, changes: changesFor('I'),
        days: list.map((d, i) => withEv('ius', i, { ...base(d), k: d.amj, s: d.k4, a: d.anlass, c: d.kommentar })) },
      v2: { view: 'v2', label: N.p2, stand: master.stand, names: namesV2, changes: changesFor('D'),
        days: list.map((d, i) => withEv('v2', i, { ...base(d), k: d.amj, a: parts(d.anlass).map(filterD).filter(Boolean).join(' · ') })) },
      v3: { view: 'v3', label: N.v3, stand: master.stand, names: namesV3, changes: changesFor('M'),
        days: list.map((d, i) => withEv('v3', i, { ...base(d), s: d.k4, a: parts(d.anlass).map(filterM).filter(Boolean).join(' · ') })) },
      // v4: nur Anwesenheiten aller Kinder, ohne Übergaben, Notizen, Orte, Kontakt
      v4: { view: 'v4', label: N.k5 || 'Ansicht 4', stand: master.stand, names: namesV4, changes: changesFor('L'),
        days: list.map(d => ({ ...base(d), k: d.amj, s: d.k4, a: parts(d.anlass).map(filterL).filter(Boolean).join(' · ') })) },
      // v5: wo Kind 4 selbst ist (+ eigene Fahrten) und wann AMJ da sind; ohne Notizen, Orte, Kontakt
      v5: { view: 'v5', label: N.k4, stand: master.stand, names: namesV5, changes: changesFor('S'),
        days: list.map((d, i) => withEv('v5', i, { ...base(d), k: d.amj, s: d.k4, a: parts(d.anlass).map(filterS).filter(Boolean).join(' · ') })) },
    };
    const F = master.feeds || {};                                         // geheime Kalender-Links je Ansicht
    if (F.v2 && F.v2.raw) views.v2.calUrl = F.v2.raw;
    if (F.v3 && F.v3.raw) views.v3.calUrl = F.v3.raw;
    if (F.v4 && F.v4.raw) views.v4.calUrl = F.v4.raw;
    if (F.v5 && F.v5.raw) views.v5.calUrl = F.v5.raw;
    if (master.contact && master.contact.whatsapp) {                 // für „Änderung anfragen“ per WhatsApp
      views.v2.contact = views.v3.contact = { wa: master.contact.whatsapp, to: N.p1 };
    }
    // Verlauf je Tag (master.hist): je Ansicht nur, was sie auch sieht – Notizen nur IuS
    const kidName = (idx, view) => idx.length === 3 ? (view === 'ius' ? 'AMJ' : view === 'v2' ? 'Die Kinder' : N.kids.join(', ').replace(/, ([^,]*)$/, ' & $1')) : idx.map(j => N.kids[j]).join(' & ');
    const PLACE_K = { ius: { I: 'bei uns', D: `bei ${N.p2}` }, v2: { I: `bei ${N.p1}`, D: 'bei dir' }, v4: { I: `bei ${N.ius}`, D: `bei ${N.p2}` }, v5: { I: 'da', D: `bei ${N.p2}` } };
    const PLACE_S = { ius: { I: 'bei uns', M: `bei ${N.v3}` }, v3: { I: `bei ${N.ius}`, M: 'bei dir' }, v4: { I: `bei ${N.ius}`, M: `bei ${N.v3}` }, v5: { I: `bei ${N.ius}`, M: `bei ${N.v3}` } };
    const FILTER = { ius: x => x, v2: filterD, v3: filterM, v4: filterL, v5: filterS };
    const histText = (view, e) => {
      const o = e.o || {}, n = e.n || {}, out = [];
      if ('k' in n && PLACE_K[view]) {
        const groups = {};
        [0, 1, 2].forEach(j => { if ((o.k || '')[j] !== n.k[j]) (groups[(o.k || '???')[j] + n.k[j]] = groups[(o.k || '???')[j] + n.k[j]] || []).push(j); });
        Object.entries(groups).forEach(([tr, idx]) => out.push(`${kidName(idx, view)}: ${PLACE_K[view][tr[0]] || '?'} → ${PLACE_K[view][tr[1]]}`));
      }
      if ('s' in n && PLACE_S[view] && o.s !== n.s) out.push(`${view === 'v5' ? 'Du' : N.k4}: ${PLACE_S[view][o.s] || '?'} → ${PLACE_S[view][n.s]}`);
      if ('a' in n || 'a' in o) {
        const fa = v => parts(v || '').map(FILTER[view]).filter(Boolean).join(' · ');
        const was = fa(o.a), now = fa(n.a);
        if (was !== now) out.push(!was ? `Termin neu: „${now}“` : !now ? `Termin entfernt: „${was}“` : `Termin: „${was}“ → „${now}“`);
      }
      if (('f' in n || 'f' in o) && !!o.f !== !!n.f) out.push(n.f ? 'als Schulferien markiert' : 'Schulferien-Markierung entfernt');
      if (view === 'ius' && ('c' in n || 'c' in o) && (o.c || '') !== (n.c || '')) out.push('Notiz geändert');
      if ((view === 'ius' || view === 'v2') && ('x' in n || 'x' in o) && (o.x || '') !== (n.x || '')) out.push('Abholen/Bringen angepasst');
      return out.join('; ');
    };
    const histByDay = {};
    (master.hist || []).forEach(e => { (histByDay[e.d] = histByDay[e.d] || []).push(e); });
    for (const view of VIEWS) views[view].days.forEach(day => {
      const vl = (histByDay[day.d] || []).map(e => [e.t, e.by || '', histText(view, e)]).filter(x => x[2]).reverse();
      if (vl.length) day.vl = vl;
    });
    views.ius.others = { v2: views.v2, v3: views.v3, v4: views.v4, v5: views.v5 };
    return views;
  }

  /* ---------- Verschlüsselung (Web Crypto, in Browser und Node gleich) ---------- */
  const C = root.crypto || (typeof crypto !== 'undefined' ? crypto : null);
  const b64enc = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const normPin = p => String(p).toLowerCase().replace(/[^a-z0-9]/g, '');

  async function pinKey(pin, saltB64, iter, extractable) {
    const km = await C.subtle.importKey('raw', new TextEncoder().encode(normPin(pin)), 'PBKDF2', false, ['deriveKey']);
    return C.subtle.deriveKey({ name: 'PBKDF2', salt: b64dec(saltB64), iterations: iter, hash: 'SHA-256' }, km,
      { name: 'AES-GCM', length: 256 }, !!extractable, ['encrypt', 'decrypt']);
  }
  async function rawKeyFromPin(pin, saltB64, iter) { return b64enc(new Uint8Array(await C.subtle.exportKey('raw', await pinKey(pin, saltB64, iter, true)))); }

  /* Probiert die PIN an allen Blöcken; liefert die passende Ansicht oder null */
  async function decryptVault(vault, pin) {
    if (normPin(pin).length < 4) return null;
    const key = await pinKey(pin, vault.salt, vault.iter, false);
    for (const b of vault.blobs) {
      try { return JSON.parse(new TextDecoder().decode(await C.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(b.iv) }, key, b64dec(b.ct)))); }
      catch (e) { /* nächster Block */ }
    }
    return null;
  }

  /* Neue data.json erzeugen. keys: {ius, v2, v3} als Base64-Rohschlüssel (gleiches Salz wie vault.salt) */
  async function buildVault(master, keys, saltB64, iter, rev) {
    const errs = validate(master);
    if (errs.length) throw new Error('Daten fehlerhaft: ' + errs.slice(0, 5).join('; '));
    const views = deriveViews(master);
    views.ius.master = master;            // nur Hauptansicht: Stammdaten + Schlüssel zum Bearbeiten
    views.ius.keys = keys;
    const blobs = [];
    for (const v of VIEWS) {
      const key = await C.subtle.importKey('raw', b64dec(keys[v]), { name: 'AES-GCM' }, false, ['encrypt']);
      const iv = C.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await C.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(views[v]))));
      blobs.push({ iv: b64enc(iv), ct: b64enc(ct) });
    }
    for (let i = blobs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [blobs[i], blobs[j]] = [blobs[j], blobs[i]]; }
    return { format: 2, rev: Number.isInteger(rev) && rev > 0 ? rev : 1, salt: saltB64, iter, blobs };
  }

  /* ---------- Kalender (iCalendar/ICS) für Outlook, Apple, Google ---------- */
  function buildICS(v) {
    const D = v.days, N = v.names, out = [], stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ymd = s => s.split('.').reverse().join('');
    const after = s => { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + 1); return ymd(fmt(d)); };
    const bei = (d, c) => [0, 1, 2].filter(i => d.k && d.k[i] === c).map(i => N.kids[i]);
    const isWE = d => d.w === 'Sa' || d.w === 'So';
    const hash = s => { let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); };
    const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const allDay = (a, b, text, kind) => out.push(['BEGIN:VEVENT', `UID:${kind}-${ymd(D[a].d)}-${hash(text)}@patchworkplanner`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(D[a].d)}`, `DTEND;VALUE=DATE:${after(D[b].d)}`, `SUMMARY:${esc(text)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT']);
    const runs = (test, label, kind) => {
      for (let i = 0; i < D.length;) {
        if (!test(D[i])) { i++; continue; }
        const t = label(D[i]); let j = i;
        while (j + 1 < D.length && test(D[j + 1]) && label(D[j + 1]) === t) j++;
        allDay(i, j, t, kind); i = j + 1;
      }
    };
    if (v.view === 'ius') {
      runs(d => bei(d, 'I').length > 0, d => (bei(d, 'I').length === 3 ? 'AMJ' : bei(d, 'I').join(' & ')) + ' bei uns', 'da');
      runs(d => d.s === 'M', () => `${N.k4} bei ${N.v3}`, 'weg');
      runs(d => !bei(d, 'I').length && d.s === 'M' && (isWE(d) || d.h || /Urlaub |Silvester|Jahre /.test(d.a)), () => 'Frei – ohne Kinder', 'frei');
      runs(d => /Männerurlaub/.test(d.a), () => `Männerurlaub ${N.p1}`, 'mu');
    } else if (v.view === 'v2') {
      runs(d => bei(d, 'I').length === 3, () => `Kinder bei ${N.p1}`, 'weg');
      runs(d => { const n = bei(d, 'I').length; return n > 0 && n < 3; }, d => `${bei(d, 'I').join(' & ')} bei ${N.p1}`, 'teil');
    } else if (v.view === 'v5') {
      runs(d => d.s === 'M', () => `Du bist bei ${N.v3}`, 'weg');
      runs(d => bei(d, 'I').length > 0, d => (bei(d, 'I').length === 3 ? N.kids.join(', ') : bei(d, 'I').join(' & ')) + ' da', 'da');
    } else if (v.view === 'v4') {
      runs(d => bei(d, 'I').length > 0, d => (bei(d, 'I').length === 3 ? N.kids.join(', ') : bei(d, 'I').join(' & ')) + ` bei ${N.ius}`, 'da');
      runs(d => d.s === 'M', () => `${N.k4} bei ${N.v3}`, 'weg');
    } else {
      runs(d => d.s === 'M', () => `${N.k4} bei dir`, 'da');
    }
    runs(d => !!d.f, () => 'Schulferien', 'ferien');
    // Anlässe (gleiche an Folgetagen zusammengefasst)
    const anl = [];
    D.forEach((d, i) => parts(d.a).forEach(t => { const r = anl.find(x => x.t === t && x.b === i - 1); if (r) r.b = i; else anl.push({ t, a: i, b: i }); }));
    anl.forEach(r => allDay(r.a, r.b, r.t, 'anlass'));
    // Abholen & Bringen
    const TIMES = { '17:00': '170000', 'abends': '180000', 'nach der Schule': '130000', 'gegen Mittag': '120000' };
    D.forEach(d => (d.u || []).forEach(u => {
      const t = TIMES[u[0]];
      if (!t) return allDay(D.indexOf(d), D.indexOf(d), u[1], 'uebergabe');
      const end = String(+t.slice(0, 2) * 100 + 30).padStart(4, '0') + '00';
      out.push(['BEGIN:VEVENT', `UID:uebergabe-${ymd(d.d)}T${t}-${hash(u[1])}@patchworkplanner`, `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/Berlin:${ymd(d.d)}T${t}`, `DTEND;TZID=Europe/Berlin:${ymd(d.d)}T${end}`, `SUMMARY:${esc(u[1])}`,
        ...(u[0] !== '17:00' ? [`DESCRIPTION:${esc('Uhrzeit ungefähr: ' + u[0])}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT']);
    }));
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PatchworkPlanner//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:Kinderplanung', 'X-WR-TIMEZONE:Europe/Berlin', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
      'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin',
      'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
      'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
      'END:VTIMEZONE', ...out.flat(), 'END:VCALENDAR'];
    // Zeilen über 75 Bytes falten (RFC 5545)
    const enc = new TextEncoder();
    return lines.map(l => {
      if (enc.encode(l).length <= 75) return l;
      const parts2 = []; let cur = '', limit = 75;
      for (const ch of l) { if (enc.encode(cur + ch).length > limit) { parts2.push(cur); cur = ' ' + ch; limit = 75; } else cur += ch; }
      parts2.push(cur); return parts2.join('\r\n');
    }).join('\r\n') + '\r\n';
  }

  /* Unterschiede zwischen zwei Ständen als Verlaufseinträge (je geändertem Tag ein Eintrag) */
  const HIST_FIELDS = ['k', 's', 'a', 'c', 'f', 'x'];
  function diffRows(oldRows, newRows, t, by) {
    const old = {}; (oldRows || []).forEach(r => { old[r.d] = r; });
    const out = [];
    (newRows || []).forEach(r => {
      const p = old[r.d]; if (!p) return;
      const o = {}, n = {};
      HIST_FIELDS.forEach(f => { const a = f === 'f' ? !!p[f] : (p[f] || ''), b = f === 'f' ? !!r[f] : (r[f] || ''); if (a !== b) { o[f] = f === 'f' ? +a : a; n[f] = f === 'f' ? +b : b; } });
      if (Object.keys(n).length) out.push({ t, d: r.d, by, o, n });
    });
    return out;
  }

  /* Versionsnummer einer data.json (ältere Stände hatten einen Zeitstempel → 0) */
  const revNum = v => (v && Number.isInteger(v.rev)) ? v.rev : 0;

  root.PlannerCore = { buildICS, revNum, WT, FEIERTAGE, ALLGEMEIN, parts, parseDate, fmt, isoWeek, validate, deriveViews,
    b64enc, b64dec, normPin, rawKeyFromPin, decryptVault, buildVault, diffRows };
})(typeof window !== 'undefined' ? window : globalThis);
