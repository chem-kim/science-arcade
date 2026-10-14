/*
 * 원소 비 대전 — 교사(진행자) 화면
 * 설정·시작·종료와 순위 판단은 이 화면이 한다. 학생 화면은 여기서 발행한 state를 따라온다.
 * 학생들은 같은 seed로 같은 순서의 원소를 받아 각자 게임하고, 점수를 players에 올린다.
 */
(function () {
  'use strict';

  const B = window.ERBattle;
  const { $, show, toast, escapeHtml, bindActions, noteCard } = window.ERUI;
  const END_GRACE_MS = 2500;   // 시간이 끝난 뒤 마지막 점수가 도착하기를 기다리는 시간
  const SAVE_KEY = 'er-host' + (new URLSearchParams(location.search).get('net') === 'local' ? '-local' : '');

  const backend = SBNet.connect();
  let room = null;
  let H = null;            // 진행자 상태 (저장·복구 대상)
  let players = {};
  let unsubs = [];
  let lastPublished = '';
  let loopTimer = null;

  document.querySelectorAll('[data-keep-net]').forEach(a => { a.href = SBNet.keepNetParam(a.getAttribute('href')); });

  // ---------- 상태 ----------

  const asArray = v => (Array.isArray(v) ? v : v ? Object.values(v) : []);
  const playerList = () => Object.entries(players).filter(([, p]) => p && p.name).map(([pid, p]) => ({ pid, ...p }))
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const opt = name => document.querySelector(`input[name="${name}"]:checked`).value;

  /** 이번 판 참가자의 점수 (지난 판 기록은 0으로) */
  function entries() {
    return H.participants.map(pid => {
      const p = players[pid] || {};
      const cur = p.round === H.round;
      return {
        pid, name: p.name || '?', online: p.online !== false,
        score: cur ? p.score || 0 : 0, correct: cur ? p.correct || 0 : 0, wrong: cur ? p.wrong || 0 : 0,
        maxCombo: cur ? p.maxCombo || 0 : 0, lives: cur && p.lives != null ? p.lives : B.LIVES,
        done: cur && !!p.done, missed: cur ? asArray(p.missed).map(Number) : [],
      };
    });
  }

  function publicState() {
    const ranking = H.status === 'playing'
      ? B.rank(entries()).map(({ missed, ...r }) => r)
      : [];
    return {
      status: H.status, round: H.round, settings: H.settings,
      seed: H.seed, startAt: H.startAt, endAt: H.endAt,
      players: playerList().map(p => ({ pid: p.pid, name: p.name, online: p.online !== false })),
      participants: H.participants, ranking, results: H.results, hardest: H.hardest,
    };
  }

  function publish(force) {
    const state = publicState();
    const json = JSON.stringify(state);
    if (force || json !== lastPublished) {
      lastPublished = json;
      room.setState(state);
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(H));
    render();
  }

  // ---------- 방 ----------

  async function createRoom() {
    backend.cleanup().catch(() => {});
    let code;
    for (let k = 0; k < 20; k++) {
      code = String(1000 + Math.floor(Math.random() * 9000));
      if (!(await backend.room(code).exists())) break;
    }
    room = backend.room(code);
    await room.create({ createdAt: backend.now() });
    H = {
      code, status: 'lobby', round: 1,
      settings: { level: 'basic', qtype: 'name2sym', duration: 90 },
      seed: 0, startAt: 0, endAt: 0, participants: [], results: [], hardest: [],
    };
    attach();
    publish(true);
  }

  function resumeRoom() {
    H = JSON.parse(localStorage.getItem(SAVE_KEY));
    room = backend.room(H.code);
    attach();
    publish(true);
  }

  function attach() {
    unsubs.forEach(u => u());
    unsubs = [room.onPlayers(p => { players = p; onPlayersChanged(); })];
    clearInterval(loopTimer);
    loopTimer = setInterval(loop, 500);
    syncSettingInputs();
    renderJoinInfo();
  }

  async function closeRoom(ask = true) {
    if (ask && !confirm('방을 닫을까요? 학생들의 연결이 끊어집니다.')) return;
    clearInterval(loopTimer);
    unsubs.forEach(u => u());
    if (room) await room.destroy();
    localStorage.removeItem(SAVE_KEY);
    room = null; H = null; players = {};
    showCreate();
  }

  // ---------- 진행 ----------

  function startGame() {
    const list = playerList().filter(p => p.online !== false);
    if (!list.length) return toast('참가한 학생이 없어요.');
    H.settings = { level: opt('level'), qtype: opt('qtype'), duration: Number(opt('duration')) };
    H.participants = list.map(p => p.pid);
    H.seed = Math.floor(Math.random() * 2 ** 31);
    H.startAt = backend.now() + B.COUNTDOWN_MS;
    H.endAt = H.startAt + H.settings.duration * 1000;
    H.results = [];
    H.hardest = [];
    H.status = 'playing';
    publish(true);
  }

  function finish() {
    const all = entries();
    H.results = B.rank(all).map(({ missed, online, done, ...r }) => r);
    H.hardest = B.hardest(all.map(e => e.missed));
    H.status = 'ended';
    publish(true);
  }

  function onPlayersChanged() {
    if (!H) return;
    // 게임 중에는 점수가 자주 바뀌므로 순위 발행은 loop()에서 0.5초마다 한 번만
    if (H.status === 'playing') render();
    else publish();
  }

  function loop() {
    if (!H) return;
    if (H.status === 'playing') {
      const now = backend.now();
      const list = entries();
      const allDone = list.length && list.every(e => e.done || !e.online);
      if (now > H.endAt + END_GRACE_MS || (now > H.startAt + 1000 && allDone)) finish();
      else { publish(); renderTimer(); }
    }
  }

  // ---------- 화면 ----------

  function showCreate() {
    const saved = localStorage.getItem(SAVE_KEY);
    $('#resume-box').hidden = !saved;
    if (saved) $('#resume-code').textContent = JSON.parse(saved).code;
    show('screen-create');
  }

  function joinUrl() {
    const base = location.href.split('?')[0].replace(/host\.html$/, '');
    return SBNet.keepNetParam(`${base}play.html?room=${H.code}`);
  }

  function renderJoinInfo() {
    $('#room-code').textContent = H.code;
    $('#game-code').textContent = `방 ${H.code}`;
    $('#join-url').textContent = joinUrl();
    const qr = $('#qr');
    qr.replaceChildren();
    if (window.QRCode) new QRCode(qr, { text: joinUrl(), width: 200, height: 200, colorDark: '#3d2c4f', colorLight: '#ffffff' });
  }

  function syncSettingInputs() {
    Object.entries(H.settings).forEach(([k, v]) => {
      const input = document.querySelector(`input[name="${k}"][value="${v}"]`);
      if (input) input.checked = true;
    });
  }

  function render() {
    if (!H) return;
    const screen = { lobby: 'screen-lobby', playing: 'screen-game', ended: 'screen-end' }[H.status];
    if (!document.getElementById(screen).classList.contains('is-active')) show(screen);
    if (H.status === 'lobby') renderLobby();
    else if (H.status === 'playing') renderGame();
    else renderEnd();
  }

  function renderLobby() {
    const list = playerList();
    $('#lobby-count').textContent = list.length;
    $('#lobby-players').innerHTML = list.map(p => `
      <li class="chip ${p.online === false ? 'is-offline' : ''}">
        <span>${escapeHtml(p.name)}</span>
        <button class="chip-x" data-action="kick" data-pid="${p.pid}" aria-label="${escapeHtml(p.name)} 내보내기">×</button>
      </li>`).join('') || '<li class="muted">아직 아무도 들어오지 않았어요</li>';
    $('#btn-start-game').disabled = !list.some(p => p.online !== false);
  }

  function renderGame() {
    $('#game-settings').textContent = B.settingsLabel(H.settings);
    const list = entries();
    B.renderLive($('#live-rank'), B.rank(list), null);
    const hard = B.hardest(list.map(e => e.missed), 4);
    $('#live-hard-empty').hidden = hard.length > 0;
    $('#live-hard').innerHTML = hard.map(h => noteCard(h.z, `<span class="nc-count">${h.count}명</span>`)).join('');
    renderTimer();
  }

  function renderTimer() {
    const now = backend.now();
    const total = H.endAt - H.startAt;
    const timer = $('#big-timer');
    if (now < H.startAt) {
      timer.textContent = `준비 ${Math.ceil((H.startAt - now) / 1000)}`;
      $('#timer-bar').style.transform = 'scaleX(1)';
      return;
    }
    const left = Math.max(0, H.endAt - now);
    const secs = Math.ceil(left / 1000);
    timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    timer.classList.toggle('is-low', left < 10000);
    $('#timer-bar').style.transform = `scaleX(${left / total})`;
  }

  function renderEnd() {
    B.renderChampion($('#champion'), H.results, null);
    B.renderPodium($('#podium'), H.results, null);
    B.renderTable($('#result-body'), H.results, null);
    $('#hard-empty').hidden = H.hardest.length > 0;
    $('#hardest').innerHTML = H.hardest.map(h => noteCard(h.z, `<span class="nc-count">${h.count}명</span>`)).join('');
  }

  // ---------- 시작 ----------

  bindActions({
    'create-room': () => createRoom().catch(e => toast('방을 만들지 못했어요: ' + e.message)),
    'resume-room': resumeRoom,
    'close-room': () => closeRoom(true),
    'start-game': startGame,
    'end-game': () => { if (confirm('게임을 지금 끝낼까요? 현재 점수로 순위가 정해집니다.')) finish(); },
    rematch: () => {
      H = { ...H, status: 'lobby', round: H.round + 1, participants: [], results: [], hardest: [] };
      syncSettingInputs();
      publish(true);
    },
    'new-game': () => closeRoom(false),
    kick: btn => {
      const pid = btn.dataset.pid;
      if (confirm(`${(players[pid] || {}).name || '?'}님을 내보낼까요?`)) room.removePlayer(pid);
    },
  });

  // 대기실에서 설정을 바꾸면 학생 화면에도 바로 보이게
  document.querySelectorAll('#screen-lobby input[type="radio"]').forEach(i => i.addEventListener('change', () => {
    if (!H || H.status !== 'lobby') return;
    H.settings = { level: opt('level'), qtype: opt('qtype'), duration: Number(opt('duration')) };
    publish();
  }));

  if (!backend) show('screen-error');
  else showCreate();
})();
