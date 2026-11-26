// Konten auf diesem Gerät: Name wählen (jeder Name nur einmal), Spielstand pro Name,
// Konto löschen. Alles liegt im Speicher des Browsers (localStorage), ohne Server.

const LIST_KEY = 'muotathal-profiles';
const OLD_SAVE = 'muotathal-save';          // Spielstand von vor den Konten
const SAVE_PREFIX = 'muotathal-save:';

const keyOf = (name) => name.toLowerCase();
export const saveKeyFor = (name) => SAVE_PREFIX + keyOf(name);

function read() {
  try { const l = JSON.parse(localStorage.getItem(LIST_KEY)); return Array.isArray(l) ? l : []; } catch (_) { return []; }
}
function write(list) { try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch (_) { /* egal */ } }

export function listProfiles() { return read(); }

// Prüft einen neuen Namen. Gibt eine Fehlermeldung oder null zurück.
export function checkName(raw) {
  const name = cleanName(raw);
  if (name.length < 2) return 'Mindestens 2 Zeichen';
  if (name.length > 16) return 'Höchstens 16 Zeichen';
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) return 'Nur Buchstaben, Zahlen, - _ .';
  if (read().some((p) => keyOf(p.name) === keyOf(name))) return 'Diesen Namen gibt es schon';
  return null;
}
export const cleanName = (raw) => String(raw || '').trim().replace(/\s+/g, ' ');

export function createProfile(raw) {
  const err = checkName(raw);
  if (err) return { error: err };
  const name = cleanName(raw);
  const list = read();
  // der allererste Name übernimmt einen alten Spielstand
  try {
    const old = localStorage.getItem(OLD_SAVE);
    if (old && list.length === 0) { localStorage.setItem(saveKeyFor(name), old); localStorage.removeItem(OLD_SAVE); }
  } catch (_) { /* egal */ }
  list.push({ name, created: Date.now() });
  write(list);
  return { name };
}

export function deleteProfile(name) {
  write(read().filter((p) => keyOf(p.name) !== keyOf(name)));
  try { localStorage.removeItem(saveKeyFor(name)); } catch (_) { /* egal */ }
}

export function progressText(name) {
  try {
    const s = JSON.parse(localStorage.getItem(saveKeyFor(name)));
    if (!s) return 'Neues Spiel';
    return s.step === 'free' ? 'Kapitel 1 geschafft' : 'Kapitel 1';
  } catch (_) { return 'Neues Spiel'; }
}

// Baut das Startmenü in el auf. onPlay(name) startet das Spiel.
export function buildMenu(el, onPlay) {
  el.innerHTML = '';
  const list = read();
  if (list.length) {
    const h = document.createElement('div'); h.className = 'pm-head'; h.textContent = 'Wer spielt?';
    el.appendChild(h);
    const box = document.createElement('div'); box.className = 'pm-list';
    for (const p of list) {
      const row = document.createElement('div'); row.className = 'pm-row';
      const play = document.createElement('button'); play.className = 'pm-play';
      play.innerHTML = '<b></b><small></small>';
      play.querySelector('b').textContent = p.name;
      play.querySelector('small').textContent = progressText(p.name);
      play.addEventListener('click', () => onPlay(p.name));
      const del = document.createElement('button'); del.className = 'pm-del'; del.textContent = 'Löschen';
      del.addEventListener('click', () => {
        if (!del.classList.contains('sure')) { del.classList.add('sure'); del.textContent = 'Wirklich?'; setTimeout(() => { del.classList.remove('sure'); del.textContent = 'Löschen'; }, 4000); return; }
        deleteProfile(p.name);
        buildMenu(el, onPlay);
      });
      row.append(play, del);
      box.appendChild(row);
    }
    el.appendChild(box);
  }
  const form = document.createElement('form'); form.className = 'pm-new';
  const input = document.createElement('input');
  input.type = 'text'; input.maxLength = 16; input.placeholder = list.length ? 'Neues Konto: Name' : 'Wähle deinen Namen';
  input.autocomplete = 'off'; input.spellcheck = false;
  const btn = document.createElement('button'); btn.type = 'submit'; btn.textContent = list.length ? 'Erstellen' : 'Los';
  const msg = document.createElement('div'); msg.className = 'pm-msg';
  form.append(input, btn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = createProfile(input.value);
    if (r.error) { msg.textContent = r.error; return; }
    input.blur();
    onPlay(r.name);
  });
  input.addEventListener('input', () => { msg.textContent = ''; });
  el.append(form, msg);
}
