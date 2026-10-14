/*
 * 빙고판 작성 (혼자 하기, 학생 화면 공용)
 * 칸 선택 → 숫자판/키보드로 입력 → 다음 빈칸으로 이동
 */
(function (global) {
  'use strict';

  const R = global.SBRules;
  const { toast } = global.SBUI;

  class BoardSetup {
    /**
     * els: { screen, board, numpad, progress, startBtn }
     * onChange: 판이 바뀔 때마다 호출 (완성 여부 전달)
     */
    constructor(els, { onChange } = {}) {
      this.els = els;
      this.onChange = onChange;
      this.board = null;
      this.view = new global.SBBoardView(els.board, {
        mode: 'setup',
        onSlot: (i, s) => { this.view.select(i, s); this.render(); },
      });
      this.bindKeyboard();
    }

    newBoard(superCount) {
      this.board = R.createBoard(superCount);
      this.view.setBoard(this.board);
      this.selectNextEmpty(null);
      this.render();
    }

    load(values) {
      this.board = R.boardFromValues(values);
      this.view.setBoard(this.board);
      this.selectNextEmpty(null);
      this.render();
    }

    slotList() {
      const list = [];
      this.board.forEach((cell, i) => cell.values.forEach((_, s) => list.push({ cell: i, slot: s })));
      return list;
    }

    selectNextEmpty(from) {
      const list = this.slotList();
      const start = from ? list.findIndex(p => p.cell === from.cell && p.slot === from.slot) + 1 : 0;
      for (let k = 0; k < list.length; k++) {
        const p = list[(start + k) % list.length];
        if (this.board[p.cell].values[p.slot] == null) return this.view.select(p.cell, p.slot);
      }
      this.view.select(null);
    }

    render() {
      const used = R.usedNumbers(this.board);
      const sel = this.view.selected;
      const current = sel ? this.board[sel.cell].values[sel.slot] : null;
      const pad = this.els.numpad;
      pad.replaceChildren();
      R.range(1, R.MAX_NUMBER).forEach(n => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'num' + (n === current ? ' is-current' : '');
        b.textContent = n;
        b.disabled = !sel || (used.has(n) && n !== current);
        b.addEventListener('click', () => this.place(n));
        pad.append(b);
      });

      const list = this.slotList();
      const filled = list.filter(p => this.board[p.cell].values[p.slot] != null).length;
      this.els.progress.textContent = `${filled} / ${list.length}`;
      const complete = R.isComplete(this.board);
      if (this.els.startBtn) this.els.startBtn.disabled = !complete;
      if (this.onChange) this.onChange(complete);
    }

    place(n) {
      const sel = this.view.selected;
      if (!sel) return;
      const cell = this.board[sel.cell];
      if (cell.super && cell.values[1 - sel.slot] === n) return toast('중첩칸에는 서로 다른 숫자 2개를 넣어야 해요.');
      cell.values[sel.slot] = n;
      this.selectNextEmpty(sel);
      this.render();
    }

    clearSlot() {
      const sel = this.view.selected;
      if (!sel) return;
      this.board[sel.cell].values[sel.slot] = null;
      this.view.refresh();
      this.render();
    }

    autoFill() {
      R.autoFill(this.board);
      this.view.refresh();
      this.selectNextEmpty(null);
      this.render();
    }

    /** 키보드 입력: 두 자리 숫자는 연달아 입력, Backspace로 지우기 */
    bindKeyboard() {
      let typed = '';
      let timer = null;
      document.addEventListener('keydown', e => {
        if (!this.board || !this.els.screen.classList.contains('is-active') || !this.view.selected) return;
        if (e.target.closest('input, textarea')) return;
        if (/^\d$/.test(e.key)) {
          typed += e.key;
          clearTimeout(timer);
          const n = Number(typed);
          const ok = n >= 1 && n <= R.MAX_NUMBER && !R.usedNumbers(this.board).has(n);
          if (typed.length === 2 || n * 10 > R.MAX_NUMBER) {
            typed = '';
            if (ok) this.place(n);
          } else {
            timer = setTimeout(() => { typed = ''; if (ok) this.place(n); }, 700);
          }
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          this.clearSlot();
        }
      });
    }
  }

  global.SBBoardSetup = BoardSetup;
})(window);
