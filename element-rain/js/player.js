/*
 * 원소 비 대전 — 학생 화면
 * 입장 → 대기 → (선생님이 시작) 3초 준비 → 게임 → 결과
 * 모두 같은 seed로 같은 순서의 원소를 받고, 내 점수를 players/{pid}에 올린다.
 */
(function () {
  'use strict';

  const E = window.ERElements;
  const L = window.ERLearn;
  const B = window.ERBattle;
  const { $, show, toast, escapeHtml, hearts, noteCard } = window.ERUI;
  const MEMO_MAX = 3;
  const REPORT_MS = 400;
  const NET_SUFFIX = new URLSearchParams(location.search).get('net') === 'local' ? '-local' : '';
  const saveKey = code => `er-player${NET_SUFFIX}-${code}`;
  const LAST_KEY = `er-player${NET_SUFFIX}-last`;
  // 로컬 테스트에서는 탭마다 다른 학생이므로 탭별 저장소 사용
  const store = NET_SUFFIX ? sessionStorage : localStorage;

  const backend = SBNet.connect();
  let room = null;
  let me = null;          // { code, pid, name, playedRound }
  let S = null;           // 진행자가 발행한 상태
  let unsub = null;
  let game = null;
  let gameRound = null;   // 지금 엔진이 돌고 있는(또는 끝난) 판
  let lastStats = null;
  let reportTimer = null;
  let lastReport = 0;

  const asArray = v => (Array.isArray(v) ? v : v ? Object.values(v) : []);
  const save = () => {
    store.setItem(saveKey(me.code), JSON.stringify(me));
    store.setItem(LAST_KEY, me.code);
  };

  // ---------- 입장 ----------

  async function join(code, name, { auto = false } = {}) {
    const r = backend.room(code);
    if (!(await r.exists())) {
      if (auto) { store.removeItem(saveKey(code)); return show('screen-join'); }
      return ($('#join-error').textContent = '그런 방이 없어요. 방 코드를 확인해 주세요.');
    }
    const saved = JSON.parse(store.getItem(saveKey(code)) || 'null');
    const rejoin = saved && (!name || saved.name === name);
    room = r;
    me = rejoin ? { ...saved, name: name || saved.name } : { code, pid: SBNet.randomId(), name, playedRound: null };
    save();
    await room.joinPlayer(me.pid, rejoin ? { name: me.name } : { name: me.name, joinedAt: backend.now() });
    $('#me-name').textContent = me.name;
    if (unsub) unsub();
    unsub = room.onState(s => onState(normalize(s)));
  }

  function normalize(s) {
    if (!s) return null;
    return {
      ...s,
      players: asArray(s.players),
      participants: asArray(s.participants),
      ranking: asArray(s.ranking),
      results: asArray(s.results),
      hardest: asArray(s.hardest),
    };
  }

  // ---------- 상태 반영 ----------

  function onState(s) {
    if (!s) {
      stopGame();
      toast('방이 닫혔어요.');
      room.leave();
      store.removeItem(saveKey(me.code));
      return show('screen-join');
    }
    S = s;
    if (s.status === 'lobby') return onLobby();
    if (!s.participants.includes(me.pid)) return show('screen-late');
    if (s.status === 'playing') return onPlaying();
    if (s.status === 'ended') return onEnded();
  }

  function onLobby() {
    stopGame();
    $('#wait-settings').innerHTML = B.settingsLabel(S.settings).split(' · ').map(t => `<span>${escapeHtml(t)}</span>`).join('');
    $('#wait-players').innerHTML = S.players.map(p =>
      `<li class="chip ${p.pid === me.pid ? 'is-me' : ''} ${p.online ? '' : 'is-offline'}">${escapeHtml(p.name)}</li>`).join('');
    if (!$('#screen-wait').classList.contains('is-active')) show('screen-wait');
  }

  function onPlaying() {
    if (gameRound !== S.round) {
      // 이 판을 이미 시작했었는데(새로고침 등) 엔진이 없으면 다시 시작하지 않고 기다림
      if (me.playedRound === S.round) {
        gameRound = S.round;
        show('screen-game');
        fieldMessage('이번 판 기록은 저장됐어요', '새로고침해서 이어서 할 수 없어요. 순위 발표를 기다려요!');
        room.updatePlayer(me.pid, { done: true });
      } else startGame();
    }
    renderRanking();
  }

  function startGame() {
    gameRound = S.round;
    me.playedRound = S.round;
    save();
    const { level, qtype } = S.settings;
    const seq = EREngine.battleSequence(E.LEVELS[level].pool, S.seed);
    let idx = 0;
    $('#game-tag').textContent = B.settingsLabel(S.settings);
    $('#answer').placeholder = E.QTYPES[qtype].placeholder;
    $('#memo-list').replaceChildren();
    $('#memo-empty').hidden = false;
    setFeedback('', '');
    show('screen-game');

    const startAt = S.startAt;
    const field = $('#field');
    field.querySelectorAll('.field-msg, .countdown').forEach(n => n.remove());
    game = new EREngine.ERGame({
      field, qtype, fallMs: E.LEVELS[level].fallMs,
      lives: B.LIVES, duration: S.endAt - S.startAt, hint: false,
      clock: () => backend.now() - startAt,
      next: () => (idx < seq.length ? seq[idx++] : null),
      on: {
        update: s => { lastStats = s; renderHud(s); report(false); },
        feedback: setFeedback,
        hit: z => {
          L.record(z, true);
          const e = E.BY_Z[z];
          setFeedback(`✓ ${e.symbol} = ${E.displayName(e)}`, 'good');
        },
        miss: z => {
          L.record(z, false);
          addMemo(z);
          const e = E.BY_Z[z];
          setFeedback(`놓쳤어요: ${e.symbol} = ${E.displayName(e)}`, 'wrong');
        },
        end: (s, reason) => {
          lastStats = s;
          report(true);
          fieldMessage(reason === 'lives' ? '❤️를 모두 썼어요!' : '시간 끝!', `${s.score}점 · 순위 발표를 기다려요`);
        },
      },
    });
    countdown(field, startAt);
    game.start();
    $('#answer').value = '';
    $('#answer').focus();
  }

  function stopGame() {
    if (game) game.stop();
    game = null;
    if (S && S.status === 'lobby') gameRound = null;
  }

  /** 점수 보고 (자주 바뀌므로 0.4초에 한 번으로 묶음) */
  function report(done) {
    if (!lastStats || !room) return;
    const send = () => {
      lastReport = Date.now();
      const s = lastStats;
      room.updatePlayer(me.pid, {
        round: gameRound, score: s.score, correct: s.correct, wrong: s.wrong, maxCombo: s.maxCombo,
        lives: s.lives, missed: s.missed, done: !!done,
      });
    };
    clearTimeout(reportTimer);
    if (done || Date.now() - lastReport >= REPORT_MS) send();
    else reportTimer = setTimeout(send, REPORT_MS - (Date.now() - lastReport));
  }

  function countdown(field, startAt) {
    const box = document.createElement('div');
    box.className = 'countdown';
    field.append(box);
    const tick = () => {
      const left = Math.ceil((startAt - backend.now()) / 1000);
      if (left <= 0 || !game) return box.remove();
      if (box.dataset.n !== String(left)) {
        box.dataset.n = left;
        box.innerHTML = `<span>${left}</span>`;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  function fieldMessage(title, sub) {
    const field = $('#field');
    field.querySelectorAll('.field-msg').forEach(n => n.remove());
    const box = document.createElement('div');
    box.className = 'field-msg';
    box.innerHTML = `<span>${escapeHtml(title)}</span><small>${escapeHtml(sub)}</small>`;
    field.append(box);
  }

  function renderHud(s) {
    $('#hud-score').textContent = s.score;
    $('#hud-combo').textContent = s.combo >= 2 ? `${s.combo} 콤보!` : '';
    $('#hud-lives').textContent = hearts(s.lives, B.LIVES);
  }

  function renderRanking() {
    const ranking = S.ranking;
    B.renderLive($('#live-rank'), ranking.slice(0, 8).concat(
      ranking.slice(8).filter(r => r.pid === me.pid)), me.pid);
    const mine = ranking.find(r => r.pid === me.pid);
    $('#hud-rank').textContent = mine ? `${mine.rank}위 / ${ranking.length}명` : '';
  }

  function setFeedback(text, kind) {
    const f = $('#feedback');
    f.textContent = text;
    f.className = `feedback ${kind || ''}`;
  }

  function addMemo(z) {
    const list = $('#memo-list');
    $('#memo-empty').hidden = true;
    list.insertAdjacentHTML('afterbegin', noteCard(z));
    while (list.children.length > MEMO_MAX) list.lastElementChild.remove();
  }

  function onEnded() {
    if (game && game.running) game.finish('time');
    const results = S.results;
    const mine = results.find(r => r.pid === me.pid);
    const winner = mine && mine.rank === 1 && mine.score > 0;
    $('#end-title').textContent = winner ? '🎉 우승!' : '게임 종료!';
    B.renderChampion($('#champion'), results, me.pid);
    $('#my-result').textContent = mine
      ? `${mine.rank <= 3 ? B.MEDAL[mine.rank - 1] + ' ' : ''}${results.length}명 중 ${mine.rank}등 · ${mine.score}점 · 원소 ${mine.correct}개`
      : '';
    B.renderPodium($('#podium'), results, me.pid);
    B.renderTable($('#result-body'), results, me.pid);
    const missed = lastStats && gameRound === S.round ? lastStats.missed : [];
    $('#notes').innerHTML = missed.map(z => noteCard(z)).join('');
    $('#notes-empty').hidden = missed.length > 0;
    if (!$('#screen-end').classList.contains('is-active')) show('screen-end');
  }

  // 남은 시간
  setInterval(() => {
    if (!S || S.status !== 'playing') return;
    const left = Math.max(0, S.endAt - backend.now());
    const secs = Math.ceil(Math.min(left, S.endAt - S.startAt) / 1000);
    const t = $('#hud-time');
    t.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    t.classList.toggle('is-low', left < 10000);
  }, 250);

  $('#field').addEventListener('pointerdown', () => setTimeout(() => $('#answer').focus(), 0));
  EREngine.bindInput($('#answer'), $('#answer-btn'), () => game);

  $('#join-form').addEventListener('submit', e => {
    e.preventDefault();
    const code = $('#in-code').value.trim();
    const name = $('#in-name').value.trim();
    $('#join-error').textContent = '';
    if (!/^\d{4}$/.test(code)) return ($('#join-error').textContent = '방 코드는 4자리 숫자예요.');
    if (!name) return ($('#join-error').textContent = '닉네임을 입력해 주세요.');
    join(code, name).catch(err => { $('#join-error').textContent = '연결에 실패했어요: ' + err.message; });
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
