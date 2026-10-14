/*
 * 중첩 빙고 — 혼자 연습하기
 * 빙고판 작성 → 컴퓨터가 무작위로 측정 → 직접 눌러 표시(30초 후 자동) → 빙고
 */
(function () {
  'use strict';

  const R = window.SBRules;
  const { $, show, toast, bindActions } = window.SBUI;

  let pool = [];

  const setup = new SBBoardSetup({
    screen: $('#screen-setup'),
    board: $('#setup-board'),
    numpad: $('#numpad'),
    progress: $('#setup-progress'),
    startBtn: $('#btn-start-play'),
  });

  const marker = new SBMarker({
    board: $('#play-board'),
    caller: $('#caller-number'),
    pending: $('#pending'),
    states: $('#state-list'),
    history: $('#history-grid'),
    progress: $('#play-progress'),
    meter: {
      toggle: $('#meter-toggle'),
      body: $('#meter-body'),
      fill: $('#meter-fill'),
      fillBar: $('#meter-fill-bar'),
      bingo: $('#meter-bingo'),
      bingoBar: $('#meter-bingo-bar'),
      expected: $('#meter-expected'),
    },
  }, {
    onBingo: lines => {
      marker.stop();
      $('#btn-measure').disabled = true;
      toast('빙고!', 'bingo');
      const winCells = [...new Set(lines.flat())];
      const superInLine = winCells.filter(i => marker.board[i].super).length;
      $('#result-summary').innerHTML =
        `<strong>${marker.calls.length}번째 측정</strong>에서 빙고를 완성했어요.<br>` +
        `완성한 줄에 들어간 중첩칸: <strong>${superInLine}개</strong>`;
      setTimeout(() => $('#result-dialog').showModal(), 1400);
    },
  });

  function newBoard() {
    setup.newBoard(R.DEFAULT_SUPER_COUNT);
    show('screen-setup');
  }

  function startPlay() {
    pool = R.shuffle(R.range(1, R.MAX_NUMBER));
    marker.start(setup.board);
    $('#btn-measure').disabled = false;
    show('screen-play');
  }

  function measureNext() {
    if (marker.finished || !pool.length) return;
    marker.receive(pool.pop());
    if (!pool.length) $('#btn-measure').disabled = true;
  }

  bindActions({
    'start-solo': newBoard,
    'go-home': () => {
      const playing = $('#screen-play').classList.contains('is-active') && !marker.finished && marker.calls.length;
      if (playing && !confirm('진행 중인 게임을 그만둘까요?')) return;
      marker.stop();
      show('screen-home');
    },
    'clear-slot': () => setup.clearSlot(),
    'auto-fill': () => setup.autoFill(),
    'reset-board': newBoard,
    'start-play': startPlay,
    'measure': measureNext,
    'replay-same': () => { $('#result-dialog').close(); startPlay(); },
    'new-board': () => { $('#result-dialog').close(); newBoard(); },
  });
})();
