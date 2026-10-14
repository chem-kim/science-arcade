/*
 * 중첩 빙고 — 교사(진행자) 화면
 * 게임 판단(차례, 건너뛰기, 순위, 종료)은 모두 이 화면이 한다.
 * 학생 화면은 여기서 발행한 state를 보고 따라온다.
 */
(function () {
  'use strict';

  const R = window.SBRules;
  const { $, show, toast, escapeHtml, bindActions, renderHistory } = window.SBUI;
  const TURN_MS = 20000;          // 차례 제한 시간
  const FINISH_WAIT_MS = 10000;   // 3등까지 정해진 뒤, 같은 측정 차례 안에 빙고를 완성하는 학생(공동 순위)을 기다리는 시간
  const SAVE_KEY = 'sb-host' + (new URLSearchParams(location.search).get('net') === 'local' ? '-local' : '');
  const PODIUM = ['🥇', '🥈', '🥉'];

  const backend = SBNet.connect();
  let room = null;
  let H = null;            // 진행자 상태 (저장·복구 대상)
  let players = {};        // 학생 데이터 (DB에서 구독)
  let unsubs = [];
  let lastPublished = '';
  let loopTimer = null;

  document.querySelectorAll('[data-keep-net]').forEach(a => { a.href = SBNet.keepNetParam(a.getAttribute('href')); });

  // ---------- 상태 ----------

  const asArray = v => (Array.isArray(v) ? v : v ? Object.values(v) : []);
  // 이름이 없는 기록(접속 직후의 잠깐 또는 남은 흔적)은 무시
  const playerList = () => Object.entries(players).filter(([, p]) => p && p.name).map(([pid, p]) => ({ pid, ...p }));
  const turnPid = () => (H.status === 'playing' ? H.turnOrder[H.turnIdx] : null);
  const nameOf = pid => (players[pid] && players[pid].name) || '?';
  const toBools = list => {
    const m = new Array(R.CELL_COUNT).fill(false);
    asArray(list).forEach(i => { m[i] = true; });
    return m;
  };
  const markedBools = p => toBools(p && p.marked);
  const missedBools = p => toBools(p && p.missed);

  function publicState() {
    return {
      status: H.status,
      superCount: H.superCount,
      players: playerList().sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
        .map(p => ({ pid: p.pid, name: p.name, ready: !!p.ready, online: p.online !== false })),
      turnOrder: H.turnOrder,
      turnPid: turnPid(),
      turnDeadline: H.turnDeadline,
      finishDeadline: H.finishDeadline,
      calls: H.calls,
      callBy: H.callBy,
      winners: H.winners,
      notice: H.notice,
      round: H.round || 1,
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

  function notice(text) {
    H.notice = { id: SBNet.randomId(), text };
    toast(text);
  }

  // ---------- 방 ----------

  async function createRoom() {
    const superCount = Number(document.querySelector('input[name="super"]:checked').value);
    backend.cleanup().catch(() => {});
    let code;
    for (let k = 0; k < 20; k++) {
      code = String(1000 + Math.floor(Math.random() * 9000));
      if (!(await backend.room(code).exists())) break;
    }
    room = backend.room(code);
    await room.create({ createdAt: backend.now() });
    H = {
      code, superCount, status: 'lobby',
      turnOrder: [], turnIdx: 0, turnDeadline: 0,
      calls: [], callBy: [], winners: [], finishDeadline: 0, notice: null, round: 1,
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
    unsubs = [
      room.onPlayers(p => { players = p; onPlayersChanged(); }),
      room.onMessage(handleMessage),
    ];
    clearInterval(loopTimer);
    loopTimer = setInterval(loop, 500);
    renderJoinInfo();
  }

  async function closeRoom() {
    if (!confirm('방을 닫을까요? 학생들의 연결이 끊어집니다.')) return;
    clearInterval(loopTimer);
    unsubs.forEach(u => u());
    if (room) await room.destroy();
    localStorage.removeItem(SAVE_KEY);
    room = null; H = null; players = {};
    showCreate();
  }

  // ---------- 진행 ----------

  function startGame() {
    const ready = playerList().filter(p => p.ready && p.values);
    if (!ready.length) return toast('준비 완료한 학생이 없어요.');
    const notReady = playerList().length - ready.length;
    if (notReady && !confirm(`아직 준비하지 않은 학생 ${notReady}명은 이번 게임에 참여하지 못해요. 시작할까요?`)) return;
    H.turnOrder = R.shuffle(ready.map(p => p.pid));
    H.turnIdx = -1;
    H.bingos = {};
    H.status = 'playing';
    advanceTurn();
    publish(true);
  }

  function advanceTurn() {
    const n = H.turnOrder.length;
    for (let k = 1; k <= n; k++) {
      const idx = (H.turnIdx + k) % n;
      const p = players[H.turnOrder[idx]];
      if (p && p.online !== false) {
        H.turnIdx = idx;
        H.turnDeadline = backend.now() + TURN_MS;
        return;
      }
    }
    // 모두 연결이 끊긴 경우: 차례를 유지하고 시간만 연장
    H.turnDeadline = backend.now() + TURN_MS;
  }

  function skipTurn(reason) {
    if (H.status !== 'playing') return;
    notice(`${nameOf(turnPid())}님의 차례가 ${reason} 다음 사람에게 넘어갔어요.`);
    advanceTurn();
    publish();
  }

  function handleMessage(msg) {
    if (!H || !msg) return;
    // 학생 쪽에서 본 '시간 초과' (이 화면이 백그라운드라 타이머가 늦어도 진행되게)
    if (msg.type === 'timeout') {
      const now = backend.now();
      if (H.status === 'playing' && msg.deadline === H.turnDeadline && now > H.turnDeadline) skipTurn('시간이 지나');
      else if (H.status === 'finishing' && msg.deadline === H.finishDeadline && now > H.finishDeadline) finish();
      return;
    }
    if (msg.type !== 'call') return;
    const n = Number(msg.n);
    if (H.status !== 'playing' || msg.pid !== turnPid()) return;
    if (!(n >= 1 && n <= R.MAX_NUMBER) || H.calls.includes(n)) return;
    H.calls.push(n);
    H.callBy.push(msg.pid);
    H.notice = null;
    if (H.status === 'playing') advanceTurn();
    checkEnd();
    publish();
  }

  /**
   * 빙고 판정: 학생이 직접 표시한 칸으로 한 줄을 완성해야 인정
   * 순위 기준 = 표시를 마친 시점까지의 측정 수 (같은 측정 차례 안에 완성하면 공동 순위)
   */
  function updateBingos() {
    H.bingos = H.bingos || {};
    H.turnOrder.forEach(pid => {
      const p = players[pid];
      if (!p || !p.values || H.bingos[pid] != null) return;
      const lineCall = R.markedBingoCall(asArray(p.values).map(asArray), H.calls, markedBools(p));
      if (lineCall == null) return;
      const reported = Number.isFinite(p.bingoAt) ? p.bingoAt : H.calls.length;
      H.bingos[pid] = Math.min(H.calls.length, Math.max(lineCall, reported));
      toast(`🎉 ${nameOf(pid)} 빙고!`, 'bingo', 4000);
    });
    const entries = Object.entries(H.bingos).map(([pid, call]) => ({ pid, name: nameOf(pid), call }));
    H.winners = R.rankByCall(entries).filter(e => e.rank <= 3);
  }

  /** 3등까지 정해졌거나, 더 빙고할 수 있는 학생이 없거나, 숫자를 다 불렀으면 마무리 */
  function checkEnd() {
    if (H.status !== 'playing') return;
    H.bingos = H.bingos || {};
    const enough = H.winners.length >= Math.min(3, H.turnOrder.length);
    const anyoneCanBingo = H.turnOrder.some(pid => H.bingos[pid] == null
      && R.cellsToBingo(markedBools(players[pid]), missedBools(players[pid])) !== Infinity);
    if (enough || !anyoneCanBingo || H.calls.length >= R.MAX_NUMBER) {
      H.status = 'finishing';
      // 숫자를 다 불렀으면 마지막 숫자를 체크할 시간(30초)을 줌
      H.finishDeadline = backend.now() + (enough || !anyoneCanBingo ? FINISH_WAIT_MS : 31000);
    }
  }

  function finish() {
    H.status = 'ended';
    publish();
  }

  function onPlayersChanged() {
    if (!H) return;
    if (H.status === 'playing' || H.status === 'finishing') {
      updateBingos();
      checkEnd();
    }
    publish();
  }

  function loop() {
    if (!H) return;
    const now = backend.now();
    if (H.status === 'playing') {
      const cur = players[turnPid()];
      const anyoneOnline = H.turnOrder.some(pid => players[pid] && players[pid].online !== false);
      if ((!cur || cur.online === false) && anyoneOnline) skipTurn('자리를 비워(화면 꺼짐·연결 끊김)');
      else if (now > H.turnDeadline) skipTurn('시간이 지나');
    } else if (H.status === 'finishing') {
      if (now > H.finishDeadline) finish();
    }
    renderTimer();
  }

  function endGameNow() {
    if (!confirm('게임을 지금 끝낼까요? 현재까지의 순위로 결과가 나옵니다.')) return;
    finish();
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
    $('#lobby-super').textContent = H.superCount;
    $('#join-url').textContent = joinUrl();
    const qr = $('#qr');
    qr.replaceChildren();
    if (window.QRCode) new QRCode(qr, { text: joinUrl(), width: 200, height: 200, colorDark: '#3d2c4f', colorLight: '#ffffff' });
  }

  function render() {
    if (!H) return;
    const screen = { lobby: 'screen-lobby', playing: 'screen-game', finishing: 'screen-game', ended: 'screen-end' }[H.status];
    if (!document.getElementById(screen).classList.contains('is-active')) show(screen);
    if (H.status === 'lobby') renderLobby();
    else if (H.status === 'ended') renderEnd();
    else renderGame();
  }

  function renderLobby() {
    const list = playerList().sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    $('#lobby-count').textContent = list.length;
    $('#lobby-players').innerHTML = list.map(p => `
      <li class="chip ${p.ready ? 'is-ready' : ''} ${p.online === false ? 'is-offline' : ''}">
        <span>${escapeHtml(p.name)}</span>${p.ready ? ' ✓' : ''}
        <button class="chip-x" data-action="kick" data-pid="${p.pid}" aria-label="${escapeHtml(p.name)} 내보내기">×</button>
      </li>`).join('') || '<li class="muted">아직 아무도 들어오지 않았어요</li>';
    $('#btn-start-game').disabled = !list.some(p => p.ready);
  }

  function renderGame() {
    const last = H.calls[H.calls.length - 1];
    const num = $('#host-number');
    if (num.textContent !== String(last ?? '–')) {
      num.textContent = last ?? '–';
      if (last != null) SBUI.retrigger(num, 'is-pop');
    }
    $('#caller-by').textContent = last != null
      ? `${nameOf(H.callBy[H.callBy.length - 1])}님이 측정했어요`
      : '첫 측정을 기다리는 중';
    $('#game-progress').textContent = `측정 ${H.calls.length} / ${R.MAX_NUMBER}`;
    renderHistory($('#host-history'), H.calls);

    $('#host-winners').innerHTML = H.winners.length
      ? H.winners.map(w => `<li>
          <span class="medal">${PODIUM[w.rank - 1]}</span> ${escapeHtml(w.name)}
          <span class="muted small">${w.call}번째 측정</span></li>`).join('')
      : '<li class="muted">아직 빙고가 없어요</li>';

    const winnerRank = new Map(H.winners.map(w => [w.pid, w.rank]));
    const rows = H.turnOrder.map(pid => ({
      pid, name: nameOf(pid), online: players[pid] && players[pid].online !== false,
      left: R.cellsToBingo(markedBools(players[pid]), missedBools(players[pid])), rank: winnerRank.get(pid),
    })).sort((a, b) => (a.rank || 99) - (b.rank || 99) || Math.min(a.left, 99) - Math.min(b.left, 99));
    const tp = turnPid();
    $('#host-status').innerHTML = rows.map(r => `
      <li class="${r.pid === tp ? 'is-turn' : ''} ${r.online ? '' : 'is-offline'}">
        <span class="name">${r.pid === tp ? '👉 ' : ''}${escapeHtml(r.name)}</span>
        <span class="dots">${r.rank ? PODIUM[r.rank - 1] : r.left === Infinity ? '✕' : '●'.repeat(R.SIZE - r.left).padEnd(R.SIZE, '○')}</span>
        <span class="left">${r.rank ? '빙고!' : r.left === Infinity ? '빙고 불가' : r.left === 0 ? '빙고!' : `${r.left}칸`}</span>
      </li>`).join('');
    renderTimer();
  }

  function renderTimer() {
    if (!H || (H.status !== 'playing' && H.status !== 'finishing')) return;
    const box = $('#turn-box');
    if (H.status === 'finishing') {
      box.classList.add('is-finishing');
      $('#turn-name').textContent = '측정이 끝났어요! 결과를 정리하는 중…';
      const left = Math.max(0, H.finishDeadline - backend.now());
      $('#turn-bar').style.transform = `scaleX(${left / FINISH_WAIT_MS})`;
      $('#turn-sec').textContent = `${Math.ceil(left / 1000)}초`;
      return;
    }
    box.classList.remove('is-finishing');
    const left = Math.max(0, H.turnDeadline - backend.now());
    $('#turn-name').textContent = `지금 차례: ${nameOf(turnPid())}`;
    $('#turn-bar').style.transform = `scaleX(${left / TURN_MS})`;
    $('#turn-sec').textContent = `${Math.ceil(left / 1000)}초`;
  }

  function renderEnd() {
    const groups = [1, 2, 3].map(rank => H.winners.filter(w => w.rank === rank));
    $('#podium').innerHTML = [2, 1, 3].map(rank => {
      const g = groups[rank - 1];
      return `<div class="step step-${rank}">
        <div class="names">${g.length ? g.map(w => `<span>${escapeHtml(w.name)}</span>`).join('') : '<span class="muted">-</span>'}</div>
        <div class="block"><span class="medal">${PODIUM[rank - 1]}</span><span>${rank}등</span>
        ${g.length ? `<small>${g[0].call}번째 측정</small>` : ''}</div>
      </div>`;
    }).join('');
  }

  // ---------- 시작 ----------

  bindActions({
    'create-room': () => createRoom().catch(e => toast('방을 만들지 못했어요: ' + e.message)),
    'resume-room': resumeRoom,
    'close-room': closeRoom,
    'start-game': startGame,
    'skip-turn': () => skipTurn('교사 판단으로'),
    'end-game': endGameNow,
    // 같은 방·같은 참가자로 다시: 대기실로 돌아가고, 학생들은 빙고판을 확인한 뒤 다시 준비
    'rematch': () => {
      H = {
        ...H, status: 'lobby', round: (H.round || 1) + 1,
        turnOrder: [], turnIdx: 0, turnDeadline: 0,
        calls: [], callBy: [], winners: [], bingos: {}, finishDeadline: 0, notice: null,
      };
      playerList().forEach(p => room.updatePlayer(p.pid, { ready: false, marked: [], missed: [], bingoAt: null }));
      publish(true);
    },
    'new-game': async () => {
      clearInterval(loopTimer);
      unsubs.forEach(u => u());
      if (room) await room.destroy();
      localStorage.removeItem(SAVE_KEY);
      H = null; players = {};
      showCreate();
    },
    'kick': btn => {
      const pid = btn.dataset.pid;
      if (confirm(`${nameOf(pid)}님을 내보낼까요?`)) room.removePlayer(pid);
    },
  });

  if (!backend) show('screen-error');
  else showCreate();
})();
