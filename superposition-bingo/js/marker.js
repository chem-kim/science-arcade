/*
 * 측정된 숫자를 내 판에서 직접 눌러 표시하기 (혼자 하기, 학생 화면 공용)
 * - 측정되면 해당 칸이 "누를 차례"가 되고, 30초 안에 누르지 않으면 놓친 칸이 된다(이번 판에서 채울 수 없음).
 * - 빙고는 직접 표시한 칸으로만 인정한다.
 * - 중첩칸은 먼저 측정된 숫자로 확정되고, 그 뒤 다른 숫자가 불려도 변하지 않는다.
 */
(function (global) {
  'use strict';

  const R = global.SBRules;
  const { toast, retrigger, sub, position, renderHistory } = global.SBUI;
  const MARK_TIMEOUT_MS = 30000;
  const METER_KEY = 'sb-meter';
  const pct = p => `${Math.round(p * 100)}%`;

  class Marker {
    /**
     * els: { board, caller, pending, states, history, progress, meter }
     *   meter: { toggle, body, fill, fillBar, bingo, bingoBar, expected } (확률 미터, 선택)
     * hooks: { onMark(index, n), onMiss(index, n), onBingo(lines), onBlocked(), onCallTap(index, event) → 처리했으면 true }
     */
    constructor(els, hooks = {}) {
      this.els = els;
      this.hooks = hooks;
      this.view = new global.SBBoardView(els.board, { mode: 'play', onCell: (i, e) => this.tap(i, e) });
      this.board = null;
      this.calls = [];
      this.pending = new Map(); // 숫자 → { index, deadline }
      this.finished = false;
      this.timer = null;
      this.bindMeter();
    }

    bindMeter() {
      const m = this.els.meter;
      if (!m) return;
      try { m.toggle.checked = localStorage.getItem(METER_KEY) === 'on'; } catch (e) { /* 저장소 없음 */ }
      m.toggle.addEventListener('change', () => {
        try { localStorage.setItem(METER_KEY, m.toggle.checked ? 'on' : 'off'); } catch (e) { /* 저장소 없음 */ }
        this.renderMeter();
      });
    }

    /**
     * 확률 미터: 학생이 "아는 것" 기준으로 계산한다.
     * 아직 누르지 않은 측정은 빼고 계산해야, 미터가 어느 칸을 눌러야 하는지 알려주지 않는다.
     */
    renderMeter() {
      const m = this.els.meter;
      if (!m || !this.board) return;
      m.body.hidden = !m.toggle.checked;
      if (!m.toggle.checked) {
        if (this.view.probs) this.view.setProbs(null);
        return;
      }
      const visible = this.board.map(c => ({ values: c.values, result: c.marked ? c.result : null, dead: c.missed }));
      const calls = this.calls.filter(n => !this.pending.has(n));
      const pr = R.probabilities(visible, calls);
      this.view.setProbs(pr.done ? null : pr.cell);
      m.fill.textContent = pct(pr.fillNext);
      m.fillBar.style.transform = `scaleX(${pr.fillNext})`;
      m.bingo.textContent = pct(pr.bingoNext);
      m.bingoBar.style.transform = `scaleX(${pr.bingoNext})`;
      m.expected.textContent = pr.done ? '빙고!' : pr.blocked ? '빙고 불가' : pr.left ? `약 ${pr.expected.toFixed(1)}번` : '-';
    }

    start(board) {
      this.board = board;
      board.forEach(cell => { cell.result = null; cell.marked = false; cell.missed = false; });
      this.calls = [];
      this.pending.clear();
      this.finished = false;
      this.view.setBoard(board);
      this.els.caller.textContent = '–';
      this.renderAll();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 250);
    }

    /** 저장된 진행 상황으로 복구 (새로고침 대비) */
    restore(board, calls, markedIdx, missedIdx = []) {
      this.start(board);
      calls.forEach(n => this.receive(n, { silent: true }));
      markedIdx.forEach(i => { board[i].marked = true; });
      missedIdx.forEach(i => { board[i].missed = true; });
      [...this.pending].forEach(([n, p]) => { if (board[p.index].marked || board[p.index].missed) this.pending.delete(n); });
      this.view.refresh();
      this.renderAll();
    }

    stop() {
      clearInterval(this.timer);
      this.finished = true;
    }

    /** 숫자 n이 측정됨 */
    receive(n, { silent = false } = {}) {
      if (this.calls.includes(n)) return;
      this.calls.push(n);
      if (!silent) {
        this.els.caller.textContent = n;
        retrigger(this.els.caller, 'is-pop');
      } else {
        this.els.caller.textContent = n;
      }

      const res = R.measure(this.board, n);
      if (res && res.status === 'collapse') {
        this.pending.set(n, { index: res.index, deadline: Date.now() + MARK_TIMEOUT_MS });
      } else if (!silent && res && res.status === 'already' && this.board[res.index].marked) {
        const cell = this.board[res.index];
        toast(`${n}이(가) 측정됐지만, 이 중첩칸은 이미 ${cell.result}(으)로 확정됐어요. 측정 결과는 되돌아가지 않아요.`, 'info');
        this.view.shake(res.index);
      }
      if (!silent) this.renderAll();
    }

    tap(i, e) {
      const cell = this.board[i];
      if (this.finished || cell.marked) return;
      const entry = [...this.pending].find(([, p]) => p.index === i);
      // 측정된 숫자 표시가 먼저, 아니면 (내 차례일 때) 이 칸의 숫자를 측정
      if (!entry && this.hooks.onCallTap && this.hooks.onCallTap(i, e)) return;
      if (!entry) {
        this.view.shake(i);
        return toast('아직 측정되지 않은 칸이에요.');
      }
      this.mark(entry[0]);
    }

    mark(n) {
      const { index } = this.pending.get(n);
      this.pending.delete(n);
      const cell = this.board[index];
      cell.marked = true;
      this.view.refresh();
      this.renderAll();

      if (cell.super) {
        const dropped = cell.values.find(v => v !== cell.result);
        toast(`측정! 중첩칸이 ${cell.result}(으)로 확정됐어요. ${dropped}은(는) 실현되지 않은 가능성이 됐어요.`, 'collapse');
      }
      if (this.hooks.onMark) this.hooks.onMark(index, n);

      const lines = R.completedLines(this.board);
      if (lines.length && !this.view.winCells.size) {
        this.view.setWinCells([...new Set(lines.flat())]);
        if (this.hooks.onBingo) this.hooks.onBingo(lines);
      }
    }

    /** 30초 안에 누르지 못함 → 놓친 칸 (자동으로 채워 주지 않음) */
    miss(n) {
      const { index } = this.pending.get(n);
      this.pending.delete(n);
      const cell = this.board[index];
      cell.missed = true;
      this.view.refresh();
      this.renderAll();
      toast(`⏰ ${n}을(를) 놓쳤어요! 그 칸은 이번 판에서 채울 수 없어요.`, 'miss', 4000);
      if (this.hooks.onMiss) this.hooks.onMiss(index, n);
      const marked = this.board.map(c => c.marked);
      const missed = this.board.map(c => c.missed);
      if (!this.view.winCells.size && R.cellsToBingo(marked, missed) === Infinity && this.hooks.onBlocked) this.hooks.onBlocked();
    }

    tick() {
      if (this.finished) return;
      const now = Date.now();
      [...this.pending].forEach(([n, p]) => { if (now >= p.deadline) this.miss(n); });
      this.els.pending.querySelectorAll('.pending-chip').forEach(chip => {
        const p = this.pending.get(Number(chip.dataset.n));
        if (!p) return;
        const left = Math.max(0, p.deadline - now);
        chip.querySelector('.sec').textContent = `${Math.ceil(left / 1000)}초`;
        chip.querySelector('.bar').style.transform = `scaleX(${left / MARK_TIMEOUT_MS})`;
      });
    }

    markedIndices() {
      return this.board.map((c, i) => (c.marked ? i : -1)).filter(i => i >= 0);
    }

    missedIndices() {
      return this.board.map((c, i) => (c.missed ? i : -1)).filter(i => i >= 0);
    }

    renderAll() {
      this.renderPending();
      if (this.els.history) renderHistory(this.els.history, this.calls);
      if (this.els.progress) this.els.progress.textContent = `측정 ${this.calls.length} / ${R.MAX_NUMBER}`;
      this.renderStates();
      this.renderMeter();
    }

    renderPending() {
      const wrap = this.els.pending;
      wrap.replaceChildren();
      if (!this.pending.size) return;
      const title = document.createElement('p');
      title.className = 'pending-title';
      title.textContent = '30초 안에 내 판에서 찾아 누르세요 (놓치면 그 칸은 못 채워요)';
      wrap.append(title);
      this.pending.forEach((p, n) => {
        const chip = document.createElement('div');
        chip.className = 'pending-chip';
        chip.dataset.n = n;
        chip.innerHTML = `<span class="n">${n}</span><span class="sec"></span><span class="bar"></span>`;
        wrap.append(chip);
      });
      this.tick();
    }

    renderStates() {
      const list = this.els.states;
      list.replaceChildren();
      let k = 0;
      this.board.forEach((cell, i) => {
        if (!cell.super) return;
        k++;
        const [a, b] = cell.values;
        const li = document.createElement('li');
        li.className = cell.marked ? 'is-collapsed' : cell.missed ? 'is-missed' : '';
        li.innerHTML = cell.marked || cell.missed
          ? `<span class="where">${position(i)}</span><span class="psi">|ψ${sub(k)}⟩ → |${cell.result}⟩</span><span class="note">${cell.missed ? '측정되어 확정 · 체크를 놓침' : '측정되어 확정'}</span>`
          : `<span class="where">${position(i)}</span><span class="psi">|ψ${sub(k)}⟩ = <span class="frac">1⁄√2</span>(|${a}⟩ + |${b}⟩)</span><span class="note">두 상태가 함께 존재</span>`;
        list.append(li);
      });
    }
  }

  global.SBMarker = Marker;
})(window);
