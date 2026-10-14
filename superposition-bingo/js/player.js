/*
 * 중첩 빙고 — 학생 화면
 * 입장 → 빙고판 작성 → 준비 완료 → (차례가 오면 숫자 측정) → 측정된 숫자 직접 누르기 → 결과
 * 진행자가 발행한 state를 따라 화면이 바뀐다.
 */
(function () {
  'use strict';

  const R = window.SBRules;
  const { $, show, toast, escapeHtml, bindActions } = window.SBUI;
  const TURN_MS = 20000;
  const PODIUM = ['🥇', '🥈', '🥉'];
  const NET_SUFFIX = new URLSearchParams(location.search).get('net') === 'local' ? '-local' : '';
  const saveKey = code => `sb-player${NET_SUFFIX}-${code}`;
  const LAST_KEY = `sb-player${NET_SUFFIX}-last`;
  // 로컬 테스트에서는 탭마다 다른 학생이므로 탭별 저장소 사용
  const store = NET_SUFFIX ? sessionStorage : localStorage;

  const backend = SBNet.connect();
  let room = null;
  let me = null;          // { code, pid, name, values, ready, marked }
  let S = null;           // 진행자가 발행한 상태
  let seenCalls = 0;
  let seenNotice = null;
  let announced = new Set();
  let callSent = false;
  let unsub = null;

  const asArray = v => (Array.isArray(v) ? v : v ? Object.values(v) : []);
  const save = () => {
    store.setItem(saveKey(me.code), JSON.stringify(me));
    store.setItem(LAST_KEY, me.code);
  };
  const nameOf = pid => ((S.players || []).find(p => p.pid === pid) || {}).name || '?';

  const setup = new SBBoardSetup({
    screen: $('#screen-setup'),
    board: $('#setup-board'),
    numpad: $('#numpad'),
    progress: $('#setup-progress'),
    startBtn: $('#btn-ready'),
  });

  const marker = new SBMarker({
    board: $('#play-board'),
    caller: $('#caller-number'),
    pending: $('#pending'),
    states: $('#state-list'),
    history: $('#history-grid'),
    progress: $('#play-progress'),
  }, {
    onMark: () => {
      me.marked = marker.markedIndices();
      save();
      room.updatePlayer(me.pid, { marked: me.marked });
    },
    onBingo: () => toast('빙고! 선생님 화면에서 순위를 확인하세요 🎉', 'bingo', 4000),
  });

  // ---------- 입장 ----------

  async function join(code, name, { auto = false } = {}) {
    const r = backend.room(code);
    if (!(await r.exists())) {
      if (auto) { store.removeItem(saveKey(code)); return show('screen-join'); }
      return ($('#join-error').textContent = '그런 방이 없어요. 방 코드를 확인해 주세요.');
    }
    const saved = JSON.parse(store.getItem(saveKey(code)) || 'null');
    const state = normalize(await r.getState());
    const rejoin = saved && (!name || saved.name === name || state.status === 'lobby');
    if (state.status !== 'lobby' && !(rejoin && state.turnOrder.includes(saved.pid))) {
      return show('screen-late');
    }

    room = r;
    me = rejoin ? { ...saved, name: name || saved.name } : { code, pid: SBNet.randomId(), name, values: null, ready: false, marked: [] };
    save();
    await room.joinPlayer(me.pid, rejoin
      ? { name: me.name }
      : { name: me.name, joinedAt: backend.now(), ready: false });
    $('#me-name').textContent = me.name;
    if (unsub) unsub();
    unsub = room.onState(s => onState(normalize(s)));
  }

  function normalize(s) {
    if (!s) return null;
    return {
      ...s,
      players: asArray(s.players),
      turnOrder: asArray(s.turnOrder),
      calls: asArray(s.calls).map(Number),
      callBy: asArray(s.callBy),
      winners: asArray(s.winners),
    };
  }

  // ---------- 상태 반영 ----------

  function onState(s) {
    if (!s) {
      toast('방이 닫혔어요.');
      room.leave();
      store.removeItem(saveKey(me.code));
      return show('screen-join');
    }
    S = s;
    if (s.notice && s.notice.id !== seenNotice) {
      if (seenNotice !== null || s.status !== 'lobby') toast(s.notice.text);
      seenNotice = s.notice.id;
    }

    if (s.status === 'lobby') return onLobby();
    if (!s.turnOrder.includes(me.pid)) return show('screen-late');
    if (s.status === 'playing' || s.status === 'finishing') return onPlaying();
    if (s.status === 'ended') return onEnded();
  }

  function onLobby() {
    if (me.ready && me.values) {
      $('#wait-players').innerHTML = S.players.map(p =>
        `<li class="chip ${p.ready ? 'is-ready' : ''}">${escapeHtml(p.name)}${p.ready ? ' ✓' : ''}</li>`).join('');
      if (!$('#screen-wait').classList.contains('is-active')) show('screen-wait');
      return;
    }
    if (!$('#screen-setup').classList.contains('is-active')) {
      const sameShape = me.values && me.values.filter(v => v.length === 2).length === S.superCount;
      if (sameShape) setup.load(me.values);
      else if (!setup.board) setup.newBoard(S.superCount);
      show('screen-setup');
    }
  }

  function onPlaying() {
    if (!marker.board) {
      marker.restore(R.boardFromValues(me.values), S.calls, me.marked || []);
      seenCalls = S.calls.length;
      S.winners.filter(w => w.confirmed).forEach(w => announced.add(w.pid));
      show('screen-play');
    }

    // 새로 측정된 숫자
    for (; seenCalls < S.calls.length; seenCalls++) {
      const n = S.calls[seenCalls];
      marker.receive(n);
      $('#caller-by').textContent = S.callBy[seenCalls] === me.pid ? '내가 측정했어요' : `${nameOf(S.callBy[seenCalls])}님이 측정했어요`;
    }

    // 빙고 발표
    S.winners.forEach(w => {
      if (!w.confirmed || announced.has(w.pid)) return;
      announced.add(w.pid);
      if (w.pid === me.pid) toast(`🎉 축하해요! ${w.rank}등이에요!`, 'bingo', 5000);
      else toast(`🎉 ${w.name} 빙고! (${w.rank}등)`, 'bingo', 4000);
    });

    renderTurn();
  }

  function onEnded() {
    marker.stop();
    const mine = S.winners.find(w => w.pid === me.pid);
    $('#my-result').textContent = mine ? `${PODIUM[mine.rank - 1]} ${mine.rank}등! ${mine.call}번째 측정에서 빙고했어요.` : '수고했어요! 다음 판에 도전해 봐요.';
    const groups = [1, 2, 3].map(rank => S.winners.filter(w => w.rank === rank));
    $('#podium').innerHTML = [2, 1, 3].map(rank => {
      const g = groups[rank - 1];
      return `<div class="step step-${rank}">
        <div class="names">${g.length ? g.map(w => `<span class="${w.pid === me.pid ? 'is-me' : ''}">${escapeHtml(w.name)}</span>`).join('') : '<span class="muted">-</span>'}</div>
        <div class="block"><span class="medal">${PODIUM[rank - 1]}</span><span>${rank}등</span></div>
      </div>`;
    }).join('');
    store.removeItem(saveKey(me.code));
    show('screen-end');
  }

  // ---------- 내 차례 ----------

  function renderTurn() {
    const myTurn = S.status === 'playing' && S.turnPid === me.pid;
    const panel = $('#my-turn');
    if (myTurn && panel.hidden) {
      callSent = false;
      buildCallPad();
      if (navigator.vibrate) navigator.vibrate(150);
    }
    panel.hidden = !myTurn;
    if (S.status === 'finishing') {
      $('#turn-name').textContent = '순위가 정해졌어요! 남은 칸을 눌러 주세요';
    } else {
      $('#turn-name').textContent = myTurn ? '👉 내 차례예요!' : `${nameOf(S.turnPid)}님 차례`;
    }
    $('#turn-box').classList.toggle('is-mine', myTurn);
  }

  function buildCallPad() {
    const pad = $('#call-pad');
    pad.replaceChildren();
    R.range(1, R.MAX_NUMBER).forEach(n => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'num';
      b.textContent = n;
      b.disabled = S.calls.includes(n);
      b.addEventListener('click', () => {
        if (callSent) return;
        callSent = true;
        pad.querySelectorAll('.num').forEach(x => { x.disabled = true; });
        b.classList.add('is-current');
        room.send({ type: 'call', pid: me.pid, n });
      });
      pad.append(b);
    });
  }

  setInterval(() => {
    if (!S || S.status !== 'playing') return;
    const left = Math.max(0, S.turnDeadline - backend.now());
    $('#turn-bar').style.transform = `scaleX(${left / TURN_MS})`;
    $('#my-turn-sec').textContent = `(${Math.ceil(left / 1000)}초)`;
  }, 250);

  // ---------- 버튼 ----------

  $('#join-form').addEventListener('submit', e => {
    e.preventDefault();
    const code = $('#in-code').value.trim();
    const name = $('#in-name').value.trim();
    $('#join-error').textContent = '';
    if (!/^\d{4}$/.test(code)) return ($('#join-error').textContent = '방 코드는 4자리 숫자예요.');
    if (!name) return ($('#join-error').textContent = '닉네임을 입력해 주세요.');
    join(code, name).catch(err => { $('#join-error').textContent = '연결에 실패했어요: ' + err.message; });
  });

  bindActions({
    'clear-slot': () => setup.clearSlot(),
    'auto-fill': () => setup.autoFill(),
    'reset-board': () => setup.newBoard(S ? S.superCount : R.DEFAULT_SUPER_COUNT),
    'ready': () => {
      me.values = setup.board.map(c => c.values.slice());
      me.ready = true;
      me.marked = [];
      save();
      room.updatePlayer(me.pid, { values: me.values, ready: true, marked: [] });
      onLobby();
    },
    'unready': () => {
      me.ready = false;
      save();
      room.updatePlayer(me.pid, { ready: false });
      onLobby();
    },
  });

  // ---------- 시작 ----------

  if (!backend) {
    show('screen-error');
  } else {
    const params = new URLSearchParams(location.search);
    const code = params.get('room') || store.getItem(LAST_KEY);
    if (params.get('room')) $('#in-code').value = params.get('room');
    const saved = code && JSON.parse(store.getItem(saveKey(code)) || 'null');
    if (saved) {
      $('#in-name').value = saved.name;
      join(code, null, { auto: true }).catch(() => show('screen-join'));
    } else {
      show('screen-join');
      $(params.get('room') ? '#in-name' : '#in-code').focus();
    }
  }
})();
