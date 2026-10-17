const $ = id => document.getElementById(id);
const sel = $('sel'), list = $('list'), empty = $('empty');
let S = { pls: [{ id: 1, name: 'My Playlist', tracks: [] }], cur: 0 };
let play = { p: null, t: null };
let shuffle = false, repeatAll = false, loopOne = false;
const paint = el => el.style.setProperty('--p', (el.value - el.min) / (el.max - el.min) * 100 + '%');
const audio = new Audio();
let url = null, dragI = null, toastTimer = null, storageOK = true;

/* ---------- small UI helpers ---------- */
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2800);
}
// in-page replacement for prompt()/confirm() (those are blocked in many viewers)
function ask(msg, def) {
  return new Promise(res => {
    $('mMsg').textContent = msg;
    const inp = def !== null && def !== undefined;
    $('mIn').hidden = !inp; $('mIn').value = inp ? def : '';
    $('modal').hidden = false;
    if (inp) { $('mIn').focus(); $('mIn').select(); }
    const done = v => { $('modal').hidden = true; $('mOk').onclick = $('mNo').onclick = $('mIn').onkeydown = null; res(v); };
    $('mOk').onclick = () => done(inp ? $('mIn').value : true);
    $('mNo').onclick = () => done(null);
    $('mIn').onkeydown = e => { if (e.key === 'Enter') done($('mIn').value); if (e.key === 'Escape') done(null); };
  });
}
const fmt = s => isFinite(s) && s > 0 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';

/* ---------- storage (IndexedDB; playlists survive reloads) ---------- */
const dbp = new Promise(res => {
  try {
    const r = indexedDB.open('media-player', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('s');
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  } catch (e) { res(null); }
});
async function load() {
  const db = await dbp; if (!db) { storageOK = false; return; }
  return new Promise(res => {
    try {
      const q = db.transaction('s').objectStore('s').get('d');
      q.onsuccess = () => res(q.result);
      q.onerror = () => res();
    } catch (e) { storageOK = false; res(); }
  });
}
async function save() {
  const db = await dbp; if (!db) return;
  try {
    const tx = db.transaction('s', 'readwrite');
    tx.objectStore('s').put(S, 'd');
    tx.onerror = tx.onabort = () => { storageOK = false; toast('Could not save (storage full or blocked)'); };
  } catch (e) { storageOK = false; }
}
const changed = () => { render(); save(); };
const curPl = () => S.pls[S.cur];
const playingPl = () => S.pls.find(p => p.id === play.p);
const playingIdx = () => { const p = playingPl(); return p ? p.tracks.findIndex(t => t.id === play.t) : -1; };

/* ---------- playback ---------- */
function setNow() {
  const p = playingPl(), t = p && p.tracks.find(x => x.id === play.t);
  $('now').textContent = t ? t.name : 'Nothing playing';
  $('sub').textContent = t ? p.name : 'Import some music to begin';
  document.title = t ? t.name + ' – Media Player' : 'Media Player';
}
function clearPlayer() {
  audio.pause(); audio.removeAttribute('src'); audio.load();
  play = { p: null, t: null }; setNow();
  $('cur').textContent = $('dur').textContent = '0:00'; $('seek').value = 0; paint($('seek'));
}
function playTrack(pid, tid) {
  const p = S.pls.find(x => x.id === pid), t = p && p.tracks.find(x => x.id === tid);
  if (!t) return;
  play = { p: pid, t: tid };
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(t.blob);
  audio.src = url;
  audio.playbackRate = +$('speed').value;
  audio.play().catch(() => {});
  setNow(); render();
}
function step(dir, auto) {
  const p = playingPl() || curPl(); if (!p.tracks.length) return;
  let i = playingIdx();
  if (shuffle && p.tracks.length > 1) {
    let j; do { j = Math.floor(Math.random() * p.tracks.length); } while (j === i);
    i = j;
  } else {
    i += dir;
    if (i >= p.tracks.length) { if (auto && !repeatAll) return; i = 0; }
    if (i < 0) i = p.tracks.length - 1;
  }
  playTrack(p.id, p.tracks[i].id);
}
function toggle() {
  if (!audio.getAttribute('src')) {
    const p = curPl(); if (p.tracks.length) playTrack(p.id, p.tracks[0].id); else toast('Import some music first');
    return;
  }
  audio.paused ? audio.play() : audio.pause();
}
function stop() { audio.pause(); audio.currentTime = 0; }

$('toggle').onclick = toggle;
$('stop').onclick = stop;
$('next').onclick = () => step(1);
$('prev').onclick = () => { if (audio.currentTime > 3) audio.currentTime = 0; else step(-1); };
$('shuf').onclick = () => { shuffle = !shuffle; $('shuf').classList.toggle('on', shuffle); toast('Shuffle ' + (shuffle ? 'on' : 'off')); };
$('rep').onclick = () => {
  repeatAll = !repeatAll;
  $('rep').classList.toggle('on', repeatAll);
  toast('Repeat playlist ' + (repeatAll ? 'on' : 'off'));
};
$('loop').onclick = () => {
  loopOne = !loopOne;
  $('loop').classList.toggle('on', loopOne);
  toast(loopOne ? 'Looping this song' : 'Song loop off');
};
$('vol').oninput = e => { audio.volume = e.target.value; audio.muted = false; paint($('vol')); $('mute').classList.toggle('muted', !audio.volume); };
$('mute').onclick = () => { audio.muted = !audio.muted; $('mute').classList.toggle('muted', audio.muted); };
$('speed').onchange = e => audio.playbackRate = +e.target.value;
$('seek').oninput = e => { if (audio.duration) audio.currentTime = e.target.value / 1000 * audio.duration; paint(e.target); };
audio.onplay = audio.onpause = () => {
  $('toggle').classList.toggle('playing', !audio.paused);
  document.body.classList.toggle('is-playing', !audio.paused);
  list.classList.toggle('paused', audio.paused);
};
audio.ontimeupdate = () => {
  $('cur').textContent = fmt(audio.currentTime);
  $('dur').textContent = fmt(audio.duration);
  $('seek').value = audio.duration ? audio.currentTime / audio.duration * 1000 : 0;
  paint($('seek'));
};
audio.onended = () => {
  if (loopOne) { audio.currentTime = 0; audio.play(); } else step(1, true);
};
audio.onerror = () => { if (audio.getAttribute('src')) toast("Can't play this file – skipping"); setTimeout(() => step(1, true), 600); };
document.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (!$('modal').hidden) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); }
  if (e.key === 'ArrowRight' && e.target.type !== 'range') step(1);
  if (e.key === 'ArrowLeft' && e.target.type !== 'range') step(-1);
});

/* ---------- playlists ---------- */
sel.onchange = () => { S.cur = +sel.value; changed(); };
$('newPl').onclick = async () => {
  const n = await ask('Name for the new playlist:', ''); if (!n || !n.trim()) return;
  S.pls.push({ id: Date.now(), name: n.trim(), tracks: [] });
  S.cur = S.pls.length - 1; changed();
};
$('renPl').onclick = async () => {
  const n = await ask('Rename playlist:', curPl().name); if (!n || !n.trim()) return;
  curPl().name = n.trim(); changed(); setNow();
};
$('delPl').onclick = async () => {
  if (S.pls.length < 2) return toast('You need at least one playlist');
  if (!await ask('Delete “' + curPl().name + '” and its songs?')) return;
  if (play.p === curPl().id) clearPlayer();
  S.pls.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); changed();
};

/* ---------- import / export ---------- */
const isAudio = f => f.type.startsWith('audio') || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm)$/i.test(f.name);
function getDur(blob) {
  return new Promise(res => {
    const u = URL.createObjectURL(blob), a = new Audio();
    const end = d => { URL.revokeObjectURL(u); res(d); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => end(a.duration || 0);
    a.onerror = () => end(0);
    setTimeout(() => end(0), 4000);
    a.src = u;
  });
}
async function addFiles(files) {
  const good = [...files].filter(isAudio);
  if (!good.length) return toast('No audio files found');
  const p = curPl();
  for (const f of good) {
    p.tracks.push({ id: Date.now() + Math.random(), name: f.name.replace(/\.[^.]+$/, ''), ext: (f.name.match(/\.[^.]+$/) || [''])[0], blob: f, dur: await getDur(f) });
  }
  changed();
  toast('Added ' + good.length + ' song' + (good.length > 1 ? 's' : ''));
  if (!storageOK) toast('Added – but this viewer can’t save between sessions');
}
function download(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
const toB64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej; r.readAsDataURL(blob);
});
function fromB64(b64, type) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
$('add').onclick = () => $('file').click();
$('file').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
$('expPl').onclick = async () => {
  const p = curPl(); if (!p.tracks.length) return toast('Nothing to export');
  toast('Preparing export…');
  try {
    const out = { app: 'media-player', version: 1, name: p.name, tracks: [] };
    for (const t of p.tracks) out.tracks.push({ name: t.name, ext: t.ext, type: t.blob.type, dur: t.dur, data: await toB64(t.blob) });
    download(new Blob([JSON.stringify(out)], { type: 'application/json' }), p.name + '.playlist.json');
    toast('Playlist exported');
  } catch (e) { toast('Export failed'); }
};
$('impPl').onclick = () => $('plFile').click();
$('plFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== 'media-player') throw 0;
    const pl = { id: Date.now(), name: d.name || 'Imported', tracks: d.tracks.map(t => ({
      id: Date.now() + Math.random(), name: t.name, ext: t.ext || '', dur: t.dur || 0, blob: fromB64(t.data, t.type || 'audio/mpeg') })) };
    S.pls.push(pl); S.cur = S.pls.length - 1; changed();
    toast('Imported “' + pl.name + '”');
  } catch (err) { toast('That is not a valid playlist file'); }
};

/* drag audio files onto the page */
let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; $('drop').hidden = false; } });
window.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $('drop').hidden = true;
  addFiles(e.dataTransfer.files);
});

/* ---------- track list ---------- */
function move(from, to) {
  const t = curPl().tracks;
  if (to < 0 || to >= t.length || from === to) return;
  t.splice(to, 0, t.splice(from, 1)[0]); changed();
}
list.onclick = async e => {
  const li = e.target.closest('li'); if (!li) return;
  const i = +li.dataset.i, p = curPl(), t = p.tracks[i], b = e.target.closest('button');
  if (!b) return playTrack(p.id, t.id);
  const a = b.dataset.a;
  if (a === 'up') move(i, i - 1);
  if (a === 'dn') move(i, i + 1);
  if (a === 'ex') download(t.blob, t.name + (t.ext || ''));
  if (a === 'rm') {
    if (play.p === p.id && play.t === t.id) clearPlayer();
    p.tracks.splice(i, 1); changed();
  }
};
list.ondragstart = e => { const li = e.target.closest('li'); if (li) { dragI = +li.dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'row'); } };
list.ondragover = e => {
  if (dragI === null) return;
  e.preventDefault();
  list.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  const li = e.target.closest('li'); if (li) li.classList.add('over');
};
list.ondrop = e => {
  if (dragI === null) return;
  e.preventDefault(); e.stopPropagation();
  const li = e.target.closest('li'); if (li) move(dragI, +li.dataset.i);
  dragI = null;
};
list.ondragend = () => { dragI = null; list.querySelectorAll('.over').forEach(x => x.classList.remove('over')); };

function render() {
  sel.innerHTML = '';
  S.pls.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = p.name + ' (' + p.tracks.length + ')';
    sel.appendChild(o);
  });
  sel.value = S.cur;
  const p = curPl();
  list.innerHTML = '';
  empty.hidden = p.tracks.length > 0;
  p.tracks.forEach((t, i) => {
    const li = document.createElement('li');
    li.draggable = true; li.dataset.i = i;
    if (play.p === p.id && play.t === t.id) li.className = 'on';
    li.innerHTML = '<span class="i"></span><span class="n"></span><span class="d"></span>' +
      '<button data-a="up" title="Move up">↑</button><button data-a="dn" title="Move down">↓</button>' +
      '<button data-a="ex" title="Export this song">⬇</button><button data-a="rm" title="Remove">✕</button>';
    if (li.className === 'on') li.querySelector('.i').innerHTML = '<span class="eq"><i></i><i></i><i></i></span>';
    else li.querySelector('.i').textContent = i + 1;
    li.querySelector('.n').textContent = t.name;
    li.querySelector('.d').textContent = t.dur ? fmt(t.dur) : '';
    list.appendChild(li);
  });
}

(async () => {
  paint($('seek')); paint($('vol'));
  render();
  const d = await load();
  if (d && d.pls && d.pls.length) { S = d; if (S.cur >= S.pls.length) S.cur = 0; render(); }
  if (!storageOK) $('sub').textContent = 'Note: this viewer blocks saving – open the file in a normal browser tab to keep playlists';
})();
