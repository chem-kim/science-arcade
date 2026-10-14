/*
 * 원소 비 — 혼자 연습하기
 * 홈(설정·도감) → 게임 → 결과(오답 노트)
 */
(function () {
  'use strict';

  const E = window.ERElements;
  const L = window.ERLearn;
  const { $, show, toast, bindActions, hearts, noteCard, renderTable, renderSong } = window.ERUI;
  const LIVES = 5;
  const MEMO_MAX = 4;

  let game = null;
  let cfg = null;          // { level, qtype, order, hint, pool, label }
  let songDone = new Set();
  let songIdx = 0;
  let pausedAt = 0;
  let pausedTotal = 0;
  let t0 = 0;

  // ?net=local 테스트 주소 유지
  if (new URLSearchParams(location.search).get('net') === 'local') {
    document.querySelectorAll('[data-keep-net]').forEach(a => { a.href += '?net=local'; });
  }

  const opt = name => document.querySelector(`input[name="${name}"]:checked`).value;
  const bestKey = c => `${c.level}-${c.qtype}-${c.order}`;

  function readOptions() {
    const level = opt('level');
    return { level, qtype: opt('qtype'), order: opt('order'), hint: $('#opt-hint').checked, pool: E.LEVELS[level].pool };
  }

  function renderBest() {
    const c = readOptions();
    const b = L.best(bestKey(c));
    $('#best-line').textContent = b ? `이 설정의 최고 기록: ${b}점` : '';
  }

  // ---------- 도감 ----------

  function renderDex() {
    const all = E.LIST.map(e => e.z);
    const s = L.summary(all);
    const basic = L.summary(E.LEVELS.basic.pool);
    $('#dex-summary').innerHTML = `
      <span>외운 원소 <b>${s.known}</b> / 118</span>
      <span>1~20번 <b>${basic.known}</b> / 20</span>
      ${s.weak ? `<span>다시 볼 원소 <b>${s.weak}</b></span>` : ''}`;
    renderTable($('#dex-table'), { cellClass: z => `is-${L.status(z)}` });
    $('#cat-legend').innerHTML = Object.entries(E.CATEGORY_LABEL)
      .map(([k, label]) => `<li class="cat-${k}"><i></i>${label}</li>`).join('');
  }

  // ---------- 게임 ----------

  const clock = () => {
    const now = performance.now();
    return (pausedAt ? pausedAt : now) - t0 - pausedTotal;
  };

  function start(override) {
    cfg = { ...readOptions(), ...override };
    cfg.pool = [...cfg.pool].sort((a, b) => a - b);
    songDone = new Set();
    songIdx = 0;
    pausedAt = 0;
    pausedTotal = 0;
    t0 = performance.now() + 3000;

    const levelLabel = override && override.label ? override.label : `${E.LEVELS[cfg.level].label} ${E.LEVELS[cfg.level].desc}`;
    $('#game-tag').textContent = `${levelLabel} · ${E.QTYPES[cfg.qtype].label}`;
    $('#answer').placeholder = E.QTYPES[cfg.qtype].placeholder;
    $('#memo-list').replaceChildren();
    $('#memo-empty').hidden = false;
    $('#feedback').textContent = '';
    $('#feedback').className = 'feedback';
    if (cfg.order === 'song') renderSong($('#song-strip'), cfg.pool, songDone, cfg.pool[0]);
    else $('#song-strip').hidden = true;

    show('screen-game');
    const field = $('#field');
    if (game) game.stop();
    game = new EREngine.ERGame({
      field, qtype: cfg.qtype, fallMs: E.LEVELS[cfg.level].fallMs * (cfg.order === 'song' ? 1.15 : 1),
      lives: LIVES, duration: null, hint: cfg.hint, clock,
      next: onScreen => {
        if (cfg.order === 'song') {
          if (songIdx >= cfg.pool.length) return null;
          return { z: cfg.pool[songIdx++], x: Math.random() };
        }
        return { z: L.pick(cfg.pool, onScreen), x: Math.random() };
      },
      on: {
        update: renderHud,
        feedback: setFeedback,
        hit: (z, hinted) => {
          if (!hinted) L.record(z, true);
          const e = E.BY_Z[z];
          setFeedback(`✓ ${e.symbol} = ${E.displayName(e)}`, 'good');
          songStep(z);
        },
        miss: z => {
          L.record(z, false);
          addMemo(z);
          const e = E.BY_Z[z];
          setFeedback(`놓쳤어요: ${e.symbol} = ${E.displayName(e)}`, 'wrong');
          songStep(z);
        },
        end: onEnd,
      },
    });
    countdown(field);
    game.start();
    $('#answer').value = '';
    $('#answer').focus();
  }

  function countdown(field) {
    const box = document.createElement('div');
    box.className = 'countdown';
    field.append(box);
    const tick = () => {
      const left = Math.ceil(-clock() / 1000);
      if (left <= 0 || !game || !game.running) return box.remove();
      if (box.dataset.n !== String(left)) {
        box.dataset.n = left;
        box.innerHTML = `<span>${left}</span>`;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  function songStep(z) {
    if (cfg.order !== 'song') return;
    songDone.add(z);
    const nextZ = cfg.pool.find(x => !songDone.has(x));
    renderSong($('#song-strip'), cfg.pool, songDone, nextZ);
  }

  function renderHud(s) {
    $('#hud-score').textContent = s.score;
    $('#hud-combo').textContent = s.combo >= 2 ? `${s.combo} 콤보!` : '';
    $('#hud-lives').textContent = hearts(s.lives, LIVES);
    const t = Math.max(0, clock());
    $('#hud-time').textContent = `${Math.floor(t / 60000)}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}`;
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

  function onEnd(s, reason) {
    const lost = LIVES - s.lives;
    const tries = s.correct + s.wrong + lost;
    $('#end-title').textContent = reason === 'clear' ? (lost ? '끝까지 왔어요!' : '완벽해요! 🎉') : '게임 끝!';
    $('#r-score').textContent = s.score;
    $('#r-correct').textContent = s.correct;
    $('#r-acc').textContent = tries ? `${Math.round((s.correct / tries) * 100)}%` : '-';
    $('#r-combo').textContent = s.maxCombo;
    $('#new-best').hidden = !(cfg.order !== 'retry' && s.score > 0 && L.saveBest(bestKey(cfg), s.score));
    $('#notes').innerHTML = s.missed.map(z => noteCard(z)).join('');
    $('#notes-empty').hidden = s.missed.length > 0;
    $('#btn-retry-missed').hidden = !s.missed.length;
    cfg.lastMissed = s.missed;
    setTimeout(() => show('screen-end'), 900);
  }

  setInterval(() => { if (game && game.running) renderHud(game.stats); }, 250);

  // 다른 탭으로 가면 일시 정지
  document.addEventListener('visibilitychange', () => {
    if (!game || !game.running) return;
    if (document.hidden) pausedAt = performance.now();
    else if (pausedAt) { pausedTotal += performance.now() - pausedAt; pausedAt = 0; }
  });

  $('#field').addEventListener('pointerdown', () => setTimeout(() => $('#answer').focus(), 0));
  EREngine.bindInput($('#answer'), $('#answer-btn'), () => game);

  bindActions({
    start: () => start(),
    again: () => start({ ...cfg }),
    'retry-missed': () => start({ ...cfg, order: 'retry', pool: cfg.lastMissed, label: '놓친 원소' }),
    quit: () => {
      if (game) game.stop();
      game = null;
      renderDex();
      show('screen-home');
    },
    home: () => { renderDex(); renderBest(); show('screen-home'); },
    'reset-dex': () => {
      if (!confirm('도감 기록(외운 원소)을 모두 지울까요?')) return;
      L.reset();
      renderDex();
      toast('도감을 초기화했어요.', 'info');
    },
  });

  document.querySelectorAll('input[name], #opt-hint').forEach(i => i.addEventListener('change', renderBest));
  renderBest();
  renderDex();
})();
