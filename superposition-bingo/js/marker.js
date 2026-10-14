/*
 * 측정된 숫자를 내 판에서 직접 눌러 표시하기 (혼자 하기, 학생 화면 공용)
 * - 측정되면 해당 칸이 "누를 차례"가 되고, 30초가 지나면 자동으로 표시된다.
 * - 중첩칸은 먼저 측정된 숫자로 확정되고, 그 뒤 다른 숫자가 불려도 변하지 않는다.
 */
(function (global) {
  'use strict';

  const R = global.SBRules;
  const { toast, retrigger, sub, position, renderHistory } = global.SBUI;
  const MARK_TIMEOUT_MS = 30000;

  class Marker {
    /**
     * els: { board, caller, pending, states, history, progress }
     * hooks: { onMark(index, n, auto), onBingo(lines) }
     */
    constructor(els, hooks = {}) {
      this.els = els;
      this.hooks = hooks;
      this.view = new global.SBBoardView(els.board, { mode: 'play', onCell: i => this.tap(i) });
      this.board = null;
      this.calls = [];
      this.pending = new Map(); // 숫자 → { index, deadline }
      this.finished = false;
      this.timer = null;
    }

    start(board) {
      this.board = board;
      board.forEach(cell => { cell.result = null; cell.marked = false; });
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
    restore(board, calls, markedIdx) {
      this.start(board);
      calls.forEach(n => this.receive(n, { silent: true }));
      markedIdx.forEach(i => { board[i].marked = true; });
      [...this.pending].forEach(([n, p]) => { if (board[p.index].marked) this.pending.delete(n); });
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

    tap(i) {
      const cell = this.board[i];
      if (this.finished || cell.marked) return;
      const entry = [...this.pending].find(([, p]) => p.index === i);
      if (!entry) {
        this.view.shake(i);
        return toast('아직 측정되지 않은 칸이에요.');
      }
      this.mark(entry[0], false);
    }

    mark(n, auto) {
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
      if (auto) toast(`30초가 지나 ${n}을(를) 자동으로 표시했어요.`);
      if (this.hooks.onMark) this.hooks.onMark(index, n, auto);

      const lines = R.completedLines(this.board);
      if (lines.length && !this.view.winCells.size) {
        this.view.setWinCells([...new Set(lines.flat())]);
        if (this.hooks.onBingo) this.hooks.onBingo(lines);
      }
    }

    tick() {
      if (this.finished) return;
      const now = Date.now();
      [...this.pending].forEach(([n, p]) => { if (now >= p.deadline) this.mark(n, true); });
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

    renderAll() {
      this.renderPending();
      if (this.els.history) renderHistory(this.els.history, this.calls);
      if (this.els.progress) this.els.progress.textContent = `측정 ${this.calls.length} / ${R.MAX_NUMBER}`;
      this.renderStates();
    }

    renderPending() {
      const wrap = this.els.pending;
      wrap.replaceChildren();
      if (!this.pending.size) return;
      const title = document.createElement('p');
      title.className = 'pending-title';
      title.textContent = '내 판에서 찾아 누르세요';
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
        li.className = cell.marked ? 'is-collapsed' : '';
        li.innerHTML = cell.marked
          ? `<span class="where">${position(i)}</span><span class="psi">|ψ${sub(k)}⟩ → |${cell.result}⟩</span><span class="note">측정되어 확정</span>`
          : `<span class="where">${position(i)}</span><span class="psi">|ψ${sub(k)}⟩ = <span class="frac">1⁄√2</span>(|${a}⟩ + |${b}⟩)</span><span class="note">두 상태가 함께 존재</span>`;
        list.append(li);
      });
    }
  }

  global.SBMarker = Marker;
})(window);
