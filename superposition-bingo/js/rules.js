/*
 * 중첩 빙고 — 게임 규칙 (화면과 무관한 순수 로직)
 * 혼자 하기, 멀티플레이(교사 화면), 시뮬레이션이 모두 이 파일을 공유한다.
 */
(function (global) {
  'use strict';

  const SIZE = 5;
  const CELL_COUNT = SIZE * SIZE;
  const MAX_NUMBER = 35;
  const DEFAULT_SUPER_COUNT = 2;

  // 가로 5줄, 세로 5줄, 대각선 2줄 = 12줄
  const LINES = (() => {
    const lines = [];
    for (let r = 0; r < SIZE; r++) lines.push([...Array(SIZE)].map((_, c) => r * SIZE + c));
    for (let c = 0; c < SIZE; c++) lines.push([...Array(SIZE)].map((_, r) => r * SIZE + c));
    lines.push([...Array(SIZE)].map((_, i) => i * SIZE + i));
    lines.push([...Array(SIZE)].map((_, i) => i * SIZE + (SIZE - 1 - i)));
    return lines;
  })();

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function range(from, to) {
    return [...Array(to - from + 1)].map((_, i) => from + i);
  }

  /** 중첩칸 위치를 무작위로 정한 빈 빙고판 */
  function createBoard(superCount = DEFAULT_SUPER_COUNT) {
    const maxSuper = MAX_NUMBER - CELL_COUNT;
    const count = Math.max(0, Math.min(superCount, maxSuper));
    const superIdx = new Set(shuffle(range(0, CELL_COUNT - 1)).slice(0, count));
    return [...Array(CELL_COUNT)].map((_, i) => ({
      super: superIdx.has(i),
      values: superIdx.has(i) ? [null, null] : [null],
      result: null,   // 측정되어 확정된 숫자 (중첩칸은 둘 중 하나)
      marked: false,  // 플레이어가 표시했는지
    }));
  }

  /** 숫자 배열만으로 빙고판 복원 (저장·전송된 판) */
  function boardFromValues(values) {
    return values.map(vs => ({ super: vs.length === 2, values: vs.slice(), result: null, marked: false }));
  }

  function usedNumbers(board) {
    const set = new Set();
    board.forEach(cell => cell.values.forEach(v => v != null && set.add(v)));
    return set;
  }

  function isComplete(board) {
    return board.every(cell => cell.values.every(v => v != null));
  }

  /** 비어 있는 칸을 남은 숫자로 무작위 채움 */
  function autoFill(board) {
    const remaining = shuffle(range(1, MAX_NUMBER).filter(n => !usedNumbers(board).has(n)));
    board.forEach(cell => {
      cell.values = cell.values.map(v => (v == null ? remaining.pop() : v));
    });
    return board;
  }

  /**
   * 숫자 n이 측정되었을 때 영향을 받는 칸을 찾는다.
   * - 아직 확정되지 않은 칸에 n이 있으면 그 칸은 n으로 확정된다(붕괴).
   * - 이미 다른 숫자로 확정된 중첩칸에 n이 있으면 아무 일도 일어나지 않는다.
   * 반환: { index, status: 'collapse' | 'already' } 또는 null(판에 없음)
   */
  function measure(board, n) {
    const index = board.findIndex(cell => cell.values.includes(n));
    if (index < 0) return null;
    const cell = board[index];
    if (cell.result != null) return { index, status: 'already' };
    cell.result = n;
    return { index, status: 'collapse' };
  }

  function completedLines(board) {
    return LINES.filter(line => line.every(i => board[i].marked));
  }

  /**
   * 측정 순서(calls)만으로 각 칸이 몇 번째 측정에서 채워지는지 계산한다(1부터, 아직이면 Infinity).
   * values: 칸마다 숫자 배열 ([7] 또는 [7, 22])
   */
  function fillOrder(values, calls) {
    const order = new Map(calls.map((n, i) => [n, i + 1]));
    return values.map(vs => Math.min(...vs.map(v => order.get(v) ?? Infinity)));
  }

  /** 몇 번째 측정에서 처음 빙고가 되는지 (아직 아니면 null). 공동 순위 판정에 쓴다. */
  function bingoCallIndex(values, calls) {
    const fill = fillOrder(values, calls);
    const best = Math.min(...LINES.map(line => Math.max(...line.map(i => fill[i]))));
    return Number.isFinite(best) ? best : null;
  }

  /** 표시된 칸(marked: boolean 배열) 기준으로 빙고까지 남은 최소 칸 수 */
  function cellsToBingo(marked) {
    return Math.min(...LINES.map(line => line.filter(i => !marked[i]).length));
  }

  /** 공동 순위: 같은 측정에서 빙고하면 같은 등수 (1, 1, 3 …) */
  function rankByCall(entries) {
    const sorted = entries.slice().sort((a, b) => a.call - b.call);
    return sorted.map(e => ({ ...e, rank: sorted.findIndex(x => x.call === e.call) + 1 }));
  }

  /**
   * 확률 미터: 남은 숫자가 무작위로 측정된다고 가정한 확률
   * board: 칸 객체 배열(result가 있으면 이미 확정), calls: 지금까지 측정된 숫자
   * 반환 { cell: 칸별 다음 측정에 채워질 확률(확정된 칸은 null), fillNext, bingoNext, expected, left }
   */
  function probabilities(board, calls, trials = 400) {
    const called = new Set(calls);
    const remaining = range(1, MAX_NUMBER).filter(n => !called.has(n));
    const left = remaining.length;
    const open = board.map(c => c.result == null);
    const cell = board.map((c, i) => (open[i] && left ? c.values.filter(v => !called.has(v)).length / left : null));

    const onBoard = new Set();
    board.forEach((c, i) => { if (open[i]) c.values.forEach(v => onBoard.add(v)); });
    const fillNext = left ? onBoard.size / left : 0;

    // 한 칸만 남은 줄들의 마지막 칸 숫자 → 그중 하나가 나오면 빙고
    const done = LINES.some(line => line.every(i => !open[i]));
    const winning = new Set();
    LINES.forEach(line => {
      const rest = line.filter(i => open[i]);
      if (rest.length === 1) board[rest[0]].values.forEach(v => winning.add(v));
    });
    const bingoNext = done ? 1 : left ? winning.size / left : 0;

    // 몬테카를로: 빙고까지 앞으로 몇 번 더 측정해야 하는지 평균
    let expected = 0;
    if (!done && left) {
      const cellOf = new Map();
      board.forEach((c, i) => { if (open[i]) c.values.forEach(v => cellOf.set(v, i)); });
      let total = 0;
      for (let t = 0; t < trials; t++) {
        const filled = open.map(o => !o);
        let steps = 0;
        for (const n of shuffle(remaining)) {
          steps++;
          const i = cellOf.get(n);
          if (i == null || filled[i]) continue;
          filled[i] = true;
          if (LINES.some(line => line.includes(i) && line.every(j => filled[j]))) break;
        }
        total += steps;
      }
      expected = total / trials;
    }
    return { cell, fillNext, bingoNext, expected, left, done };
  }

  global.SBRules = {
    SIZE, CELL_COUNT, MAX_NUMBER, DEFAULT_SUPER_COUNT, LINES,
    shuffle, range, createBoard, boardFromValues, usedNumbers, isComplete, autoFill, measure, completedLines,
    fillOrder, bingoCallIndex, cellsToBingo, rankByCall, probabilities,
  };
})(window);
