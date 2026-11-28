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
  const VIEWS = ['ius', 'v2', 'v3', 'v4', 'v5', 'v6'];

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
    (master.changes || []).forEach((c, i) => { if (!/^[IDMLSA]+$/.test(c.wer || '') || !c.text) err.push(`Änderung ${i + 1} ungültig`); });
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
    const filterA = x => {                                                // v6 (Kind 1): wie v4, dazu Papa-Kind-WE; eigener Geburtstag als „Dein Geburtstag“
      if (x === 'Fasching/Ball') return 'Fasching';
      if (x === 'Ostern (AMJ ab Mittag)') return 'Ostern';
      if (x === `${N.kids[0]} Geburtstag`) return 'Dein Geburtstag';
      if (FEIERTAGE.includes(x) || ALLGEMEIN.includes(x) || x === 'Fasching' || x.startsWith('Papa-Kind-WE') || kidBirthdays.includes(x)
        || x === `${N.k4} Geburtstag` || (N.k5 && x === `${N.k5} Geburtstag`)) return x;
      return null;
    };
    const changesFor = c => (master.changes || []).filter(x => x.wer.includes(c)).map(({ d, iso, text }) => ({ d, iso, text }));

    // Abholen & Bringen aus Regeln; Ausnahmen = „Zeit nach Absprache“
    const ev = { ius: list.map(() => []), v2: list.map(() => []), v3: list.map(() => []), v5: list.map(() => []) };
    const kidsTxt = (idx, view) => idx.length === 3 ? (view === 'v2' ? 'die Kinder' : 'AMJ') : idx.map(i => N.kids[i]).join(' & ');
    const wdOf = d => WT[d.date.getUTCDay()];
    const addAMJ = (i, t, f) => { ev.ius[i].push([t, f('ius'), 'amj']); ev.v2[i].push([t, f('v2'), 'amj']); };
    // Ende eines reinen Kinder-WE (Fr bei P2, Sa+So bei P1, Mo wieder bei P2): Rückgabe So 17:00, auch in den Ferien
    const pureWEend = (i, dep) => list[i].f && list[i - 2] && wdOf(list[i - 1]) === 'Sa' && dep.every(j => list[i - 1].amj[j] === 'I' && list[i - 2].amj[j] === 'D');
    for (let i = 0; i < list.length; i++) {
      const d = list[i], p = list[i - 1], nx = list[i + 1];
      if (p) {
        const arr = [0, 1, 2].filter(j => d.amj[j] === 'I' && p.amj[j] === 'D');
        if (arr.length) {
          // reines Kinder-WE (nur Sa+So bei P1, Mo wieder bei P2): Abholen am Freitag, auch in den Ferien
          const pureWE = list[i + 1] && list[i + 2] && wdOf(list[i + 1]) === 'So' && arr.every(j => list[i + 1].amj[j] === 'I' && list[i + 2].amj[j] === 'D');
          // Ausnahmen (Feld x): V = Abholung am Vorabend, A = P1 holt am Tag selbst ab (Zeit nach Absprache)
          if (d.x.includes('V')) addAMJ(i - 1, 'abends', v => `${N.p1} holt ${kidsTxt(arr, v)} ab`);
          else if (d.x.includes('A')) addAMJ(i, '', v => `${N.p1} holt ${kidsTxt(arr, v)} ab (Zeit nach Absprache)`);
          else if (wdOf(d) === 'Sa' && wdOf(p) === 'Fr' && ((!d.f && !p.f) || pureWE)) addAMJ(i - 1, 'abends', v => `${N.p1} holt ${kidsTxt(arr, v)} ab`);
          else addAMJ(i, '', v => `${kidsTxt(arr, v)} ${arr.length > 1 ? 'kommen' : 'kommt'} zu ${N.p1} (Zeit nach Absprache)`);
        }
      }
      if (nx) {
        const dep = [0, 1, 2].filter(j => d.amj[j] === 'I' && nx.amj[j] === 'D');
        if (dep.length) {
          if (d.x.includes('B')) addAMJ(i, '', v => `${N.p1} bringt ${kidsTxt(dep, v)} zurück (Zeit nach Absprache)`);   // Ausnahme B: P1 bringt zurück
          else if (wdOf(d) === 'So' && ((!d.f && !nx.f) || pureWEend(i, dep))) addAMJ(i, '17:00', v => `${N.p1} bringt ${kidsTxt(dep, v)} zurück`);
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
    const namesV5 = { kids: N.kids, k4: N.k4, p1: N.p1, ius: N.ius, p2: N.p2, v3: N.v3 };
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
      // v6: Kind 1 – Anwesenheiten aller Kinder wie v4, ohne Übergaben, Notizen, Orte, Kontakt
      v6: { view: 'v6', label: N.kids[0], stand: master.stand, names: namesV4, changes: changesFor('A'),
        days: list.map(d => ({ ...base(d), k: d.amj, s: d.k4, a: parts(d.anlass).map(filterA).filter(Boolean).join(' · ') })) },
    };
    const F = master.feeds || {};                                         // geheime Kalender-Links je Ansicht
    if (F.v2 && F.v2.raw) views.v2.calUrl = F.v2.raw;
    if (F.v3 && F.v3.raw) views.v3.calUrl = F.v3.raw;
    if (F.v4 && F.v4.raw) views.v4.calUrl = F.v4.raw;
    if (F.v5 && F.v5.raw) views.v5.calUrl = F.v5.raw;
    if (F.v6 && F.v6.raw) views.v6.calUrl = F.v6.raw;
    if (master.contact && master.contact.whatsapp) {                 // für „Änderung anfragen“ per WhatsApp
      views.v2.contact = views.v3.contact = { wa: master.contact.whatsapp, to: N.p1 };
    }
    // Verlauf je Tag (master.hist): je Ansicht nur, was sie auch sieht – Notizen nur IuS
    const kidName = (idx, view) => idx.length === 3 ? (view === 'ius' ? 'AMJ' : view === 'v2' ? 'Die Kinder' : N.kids.join(', ').replace(/, ([^,]*)$/, ' & $1')) : idx.map(j => N.kids[j]).join(' & ');
    const PLACE_K = { ius: { I: 'bei uns', D: `bei ${N.p2}` }, v2: { I: `bei ${N.p1}`, D: 'bei dir' }, v4: { I: `bei ${N.ius}`, D: `bei ${N.p2}` }, v5: { I: 'da', D: `bei ${N.p2}` }, v6: { I: `bei ${N.ius}`, D: `bei ${N.p2}` } };
    const PLACE_S = { ius: { I: 'bei uns', M: `bei ${N.v3}` }, v3: { I: `bei ${N.ius}`, M: 'bei dir' }, v4: { I: `bei ${N.ius}`, M: `bei ${N.v3}` }, v5: { I: `bei ${N.ius}`, M: `bei ${N.v3}` }, v6: { I: `bei ${N.ius}`, M: `bei ${N.v3}` } };
    const FILTER = { ius: x => x, v2: filterD, v3: filterM, v4: filterL, v5: filterS, v6: filterA };
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
      if (view === 'ius' && e.r) out.push(String(e.r));                      // Dienstreisen: nur Hauptansicht
      if ((view === 'ius' || view === 'v2') && ('x' in n || 'x' in o) && (o.x || '') !== (n.x || '')) out.push('Abholen/Bringen angepasst');
      return out.join('; ');
    };
    const histByDay = {};
    (master.hist || []).forEach(e => { (histByDay[e.d] = histByDay[e.d] || []).push(e); });
    for (const view of VIEWS) views[view].days.forEach(day => {
      const vl = (histByDay[day.d] || []).map(e => [e.t, e.by || '', histText(view, e)]).filter(x => x[2]).reverse();
      if (vl.length) day.vl = vl;
    });
    // Dienstreisen: nur Hauptansicht (nie in v2–v6)
    const R = master.reisen || [];
    if (R.length) {
      views.ius.reisen = R;
      const ic = master.reise && master.reise.icon;                            // eigenes Reise-Zeichen (liegt nur verschlüsselt im Plan)
      if (typeof ic === 'string' && /^data:image\/(svg\+xml|png);base64,[A-Za-z0-9+/=]+$/.test(ic) && ic.length < 40000) views.ius.reiseIcon = ic;
      views.ius.days.forEach(day => { const rr = reisenAmTag(R, day.d.split('.').reverse().join('-')); if (rr.length) day.r = rr; });
    }
    views.ius.others = { v2: views.v2, v3: views.v3, v4: views.v4, v5: views.v5, v6: views.v6 };
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
    delete views.ius.others;              // R2: die anderen Ansichten nicht doppelt speichern – expandRoot() leitet sie beim Öffnen ab
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

  /* Entschlüsselter Block der Hauptansicht → vollständige Ansicht inkl. der anderen (aus den Stammdaten abgeleitet).
     Andere Ansichten und ältere Blöcke (mit gespeicherten „others“) bleiben unverändert. */
  function expandRoot(v) {
    if (!v || !v.master || v.others) return v;
    return Object.assign(deriveViews(v.master).ius, { master: v.master, keys: v.keys });
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
    } else if (v.view === 'v4' || v.view === 'v6') {
      runs(d => bei(d, 'I').length > 0, d => (bei(d, 'I').length === 3 ? N.kids.join(', ') : bei(d, 'I').join(' & ')) + ` bei ${N.ius}`, 'da');
      runs(d => d.s === 'M', () => `${N.k4} bei ${N.v3}`, 'weg');
    } else {
      runs(d => d.s === 'M', () => `${N.k4} bei dir`, 'da');
    }
    if (v.view === 'ius') (v.reisen || []).forEach(r => {
      const tz = x => x.tag.replace(/-/g, '') + 'T' + x.uhr.replace(':', '') + '00';
      out.push(['BEGIN:VEVENT', `UID:reise-${hash(r.uid)}@patchworkplanner`, `DTSTAMP:${stamp}`,
        ...(r.von.ganz ? [`DTSTART;VALUE=DATE:${r.von.tag.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${tagPlus(r.bis.tag, 1).replace(/-/g, '')}`]
          : [`DTSTART;TZID=Europe/Berlin:${tz(r.von)}`, `DTEND;TZID=Europe/Berlin:${tz(r.bis.uhr ? r.bis : r.von)}`]),
        `SUMMARY:${esc(r.titel)}`, 'END:VEVENT']);
    });
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

  /* ---------- Server (Phase 7): Lesen, Speichern, Anmelden ----------
     fetchFn wird übergeben (Browser: fetch, Tests: nachgebauter Server). Fehler wie bisher als {kind:…}. */
  const KENNUNG_RE = /^[a-z0-9_-]{1,32}$/;
  async function serverLoad(fetchFn, base, kennung) {
    if (!KENNUNG_RE.test(kennung || '')) throw new Error('Ungültige Plan-Kennung');
    const r = await fetchFn(`${base}/api/planer/lesen/${kennung}?ts=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('Server antwortet nicht (' + r.status + ')');
    const v = await r.json();
    if (!v || !v.blobs || !Number.isInteger(v.rev)) throw new Error('Server liefert keinen gültigen Plan');
    return v;
  }
  /* Speichert vault (mit rev = oldRev + 1). Gibt die neue rev zurück. Wirft {kind:'auth'|'conflict'} oder Error. */
  async function serverSave(fetchFn, base, kennung, token, oldRev, vault) {
    if (!token) throw { kind: 'auth' };
    if (!vault || vault.rev !== oldRev + 1) throw new Error('Interner Fehler: Versionsnummer passt nicht');
    let r;
    try {
      r = await fetchFn(`${base}/api/planer/speichern`, { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ kennung, rev: oldRev, block: vault }) });
    } catch (e) { throw new Error('Server nicht erreichbar'); }
    if (r.status === 401 || r.status === 403) throw { kind: 'auth' };
    if (r.status === 409) throw { kind: 'conflict' };
    if (r.status === 413) throw new Error('Der Plan ist zu groß für den Server');
    if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (e) {} throw new Error('Speichern fehlgeschlagen (' + r.status + (m ? ': ' + m : '') + ')'); }
    const d = await r.json();
    if (!d || d.rev !== vault.rev) throw new Error('Server bestätigt eine andere Version');
    return d.rev;
  }
  /* Ablauf (ms) aus einem Anmelde-Token lesen; null, wenn unlesbar */
  function tokenExp(token) {
    try {
      const p = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = typeof atob === 'function' ? atob(p + '==='.slice((p.length + 3) % 4)) : Buffer.from(p, 'base64').toString();
      const exp = JSON.parse(json).exp; return Number.isFinite(exp) ? exp * 1000 : null;
    } catch (e) { return null; }
  }
  /* Anmelden; gibt {token, exp} zurück oder wirft {kind:'login'} (falsche Daten) bzw. Error */
  async function serverLogin(fetchFn, base, email, password) {
    let r;
    try {
      r = await fetchFn(`${base}/api/collections/konten/auth-with-password`, { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }) });
    } catch (e) { throw new Error('Server nicht erreichbar'); }
    if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404) throw { kind: 'login' };
    if (r.status === 429) throw new Error('Zu viele Versuche – bitte eine Minute warten');
    if (!r.ok) throw new Error('Anmeldung fehlgeschlagen (' + r.status + ')');
    const d = await r.json(), exp = tokenExp(d && d.token);
    if (!d || !d.token || !exp) throw new Error('Server liefert keine gültige Anmeldung');
    return { token: d.token, exp };
  }

  /* ---------- Dienstreisen per Mail (nur Hauptansicht, Bauplan_Dienstreisen.md) ---------- */
  // Outlook schickt Windows-Zonennamen; die häufigsten auf IANA abbilden
  const WINZONE = { 'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest',
    'Central European Standard Time': 'Europe/Warsaw', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik', 'UTC': 'UTC',
    'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Helsinki', 'GTB Standard Time': 'Europe/Athens', 'Turkey Standard Time': 'Europe/Istanbul',
    'Russian Standard Time': 'Europe/Moscow', 'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Pacific Standard Time': 'America/Los_Angeles',
    'Arabian Standard Time': 'Asia/Dubai', 'India Standard Time': 'Asia/Kolkata', 'Singapore Standard Time': 'Asia/Singapore', 'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo' };
  const istZone = z => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch (e) { return false; } };
  function zoneParts(ms, zone) {
    const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
    return p;
  }
  const zoneOffset = (ms, zone) => { const p = zoneParts(ms, zone); return (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60000) * 60000) / 60000; };
  function wandzeitNachUtc(y, mo, d, h, mi, zone) {
    const g = Date.UTC(y, mo - 1, d, h, mi); let t = g - zoneOffset(g, zone) * 60000;
    const o2 = zoneOffset(t, zone); return g - o2 * 60000;
  }
  const tagPlus = (tag, n) => { const d = new Date(tag + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  // iCalendar-Zeit {wert, tz, nurDatum} → { tag: 'JJJJ-MM-TT', uhr?: 'HH:MM' (deutsche Zeit), ganz?, unsicher? }
  function reiseZeit(z) {
    const m = z && z.wert && /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(z.wert).trim());
    if (!m) return null;
    if (z.nurDatum || !m[4]) return { tag: `${m[1]}-${m[2]}-${m[3]}`, ganz: true };
    let zone = m[7] ? 'UTC' : z.tz ? (WINZONE[z.tz] || (istZone(z.tz) ? z.tz : null)) : 'Europe/Berlin', unsicher = false;
    if (!zone) { zone = 'Europe/Berlin'; unsicher = true; }
    const p = zoneParts(wandzeitNachUtc(+m[1], +m[2], +m[3], +m[4], +m[5], zone), 'Europe/Berlin');
    const r = { tag: `${p.year}-${p.month}-${p.day}`, uhr: `${p.hour}:${p.minute}` };
    if (unsicher) r.unsicher = true;
    return r;
  }
  /* Einen entschlüsselten Eingangs-Eintrag {methode, termine} in die Reiseliste einarbeiten.
     Je Termin-Kennung zählt die höchste Sequenz; Absagen streichen den Termin. */
  function reiseEinarbeiten(reisen, e) {
    const out = (reisen || []).map(r => ({ ...r }));
    for (const t of (e && e.termine) || []) {
      if (!t || !t.uid) continue;
      const seq = Number.isFinite(t.sequenz) ? t.sequenz : 0;
      const i = out.findIndex(r => r.uid === t.uid);
      if (i >= 0 && out[i].seq > seq) continue;
      if (e.methode === 'CANCEL' || t.status === 'CANCELLED') { if (i >= 0) out.splice(i, 1); continue; }
      const von = reiseZeit(t.beginn); if (!von) continue;
      let bis = reiseZeit(t.ende) || von;
      if (von.ganz && bis.ganz && bis.tag > von.tag) bis = { ...bis, tag: tagPlus(bis.tag, -1) };   // Ende bei Ganztägigem ist der Folgetag
      if (bis.tag < von.tag) bis = von;
      const r = { uid: String(t.uid).slice(0, 300), seq, titel: String(t.titel || 'Dienstreise').replace(/^\s*(Abgesagt|Abgesagt|Canceled|Cancelled|Aktualisiert|Updated)\s*:\s*/i, '').slice(0, 200) || 'Dienstreise', von, bis };
      if (i >= 0) out[i] = r; else out.push(r);
    }
    return out.sort((a, b) => (a.von.tag + (a.von.uhr || '')).localeCompare(b.von.tag + (b.von.uhr || '')));
  }
  /* Verlaufseinträge für geänderte Reisen (nur Hauptansicht): neu, geändert, abgesagt */
  function reiseVerlauf(alt, neu, t, by) {
    const de = tag => tag.split('-').reverse().join('.');
    const kurz = tag => de(tag).slice(0, 6);
    const zeit = r => r.von.ganz ? (r.von.tag === r.bis.tag ? `${kurz(r.von.tag)} ganztägig` : `${kurz(r.von.tag)}–${kurz(r.bis.tag)} ganztägig`)
      : r.von.tag === r.bis.tag ? `${kurz(r.von.tag)} ${r.von.uhr}–${r.bis.uhr}` : `${kurz(r.von.tag)} ${r.von.uhr} – ${kurz(r.bis.tag)} ${r.bis.uhr}`;
    const A = {}, out = []; (alt || []).forEach(r => { A[r.uid] = r; });
    (neu || []).forEach(r => {
      const a = A[r.uid]; delete A[r.uid];
      if (!a) out.push({ t, d: de(r.von.tag), by, r: `Dienstreise neu: „${r.titel}“ (${zeit(r)})` });
      else if (JSON.stringify([a.titel, a.von, a.bis]) !== JSON.stringify([r.titel, r.von, r.bis])) out.push({ t, d: de(r.von.tag), by, r: `Dienstreise geändert: „${r.titel}“ (${zeit(r)})` });
    });
    Object.values(A).forEach(a => out.push({ t, d: de(a.von.tag), by, r: `Dienstreise abgesagt: „${a.titel}“` }));
    return out;
  }
  /* Reisen an einem Tag (JJJJ-MM-TT) als [Zeit, Titel] für die Anzeige */
  function reisenAmTag(reisen, tag) {
    return (reisen || []).filter(r => r.von.tag <= tag && r.bis.tag >= tag).map(r => {
      const erster = r.von.tag === tag, letzter = r.bis.tag === tag;
      const zeit = r.von.ganz ? 'ganztägig' : erster && letzter ? `${r.von.uhr}–${r.bis.uhr}` : erster ? `ab ${r.von.uhr}` : letzter ? `bis ${r.bis.uhr}` : 'ganztägig';
      return [zeit, r.titel];
    });
  }

  root.PlannerCore = { buildICS, revNum, WT, FEIERTAGE, ALLGEMEIN, parts, parseDate, fmt, isoWeek, validate, deriveViews,
    b64enc, b64dec, normPin, rawKeyFromPin, decryptVault, buildVault, expandRoot, diffRows,
    serverLoad, serverSave, serverLogin, tokenExp, reiseZeit, reiseEinarbeiten, reisenAmTag, reiseVerlauf };
})(typeof window !== 'undefined' ? window : globalThis);
