/*
 * 빙고판 화면 그리기
 * - setup 모드: 칸(중첩칸은 사선으로 나뉜 두 슬롯)을 눌러 숫자를 고른다.
 * - play 모드: 칸을 눌러 측정된 숫자를 표시한다. 중첩칸은 붕괴 연출을 보여준다.
 * DOM은 한 번만 만들고 refresh()로 상태만 바꿔서 CSS 전환 효과가 끊기지 않게 한다.
 */
(function (global) {
  'use strict';

  const { SIZE } = global.SBRules;
  const SLOT_NAMES = ['a', 'b'];

  function position(i) {
    return `${Math.floor(i / SIZE) + 1}행 ${(i % SIZE) + 1}열`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  class BoardView {
    constructor(container, { mode, onSlot, onCell }) {
      this.container = container;
      this.mode = mode;
      this.onSlot = onSlot;
      this.onCell = onCell;
      this.board = null;
      this.cells = [];
      this.selected = null; // setup 모드: { cell, slot }
      this.winCells = new Set();
    }

    setBoard(board) {
      this.board = board;
      this.winCells = new Set();
      this.container.replaceChildren();
      this.cells = board.map((cell, i) => {
        const node = el('div', 'cell' + (cell.super ? ' is-super' : ''));
        node.setAttribute('role', 'gridcell');
        node.dataset.idx = i;

        if (this.mode === 'setup') {
          cell.values.forEach((_, s) => {
            const slot = el('button', `slot slot-${SLOT_NAMES[s]}`);
            slot.type = 'button';
            slot.addEventListener('click', () => this.onSlot(i, s));
            node.append(slot);
          });
        } else {
          const btn = el('button', 'cell-btn');
          btn.type = 'button';
          btn.addEventListener('click', () => this.onCell(i));
          cell.values.forEach((_, s) => btn.append(el('span', `val val-${SLOT_NAMES[s]}`)));
          if (cell.super) btn.append(el('span', 'burst'));
          node.append(btn);
        }
        this.container.append(node);
        return node;
      });
      this.refresh();
    }

    select(cellIdx, slot) {
      this.selected = cellIdx == null ? null : { cell: cellIdx, slot };
      this.refresh();
    }

    setWinCells(indices) {
      this.winCells = new Set(indices);
      this.refresh();
    }

    refresh() {
      this.board.forEach((cell, i) => {
        const node = this.cells[i];
        if (this.mode === 'setup') this.refreshSetupCell(cell, node, i);
        else this.refreshPlayCell(cell, node, i);
      });
    }

    refreshSetupCell(cell, node, i) {
      node.querySelectorAll('.slot').forEach((slot, s) => {
        const v = cell.values[s];
        slot.textContent = v ?? '';
        const isSel = this.selected && this.selected.cell === i && this.selected.slot === s;
        slot.classList.toggle('is-selected', !!isSel);
        slot.classList.toggle('is-empty', v == null);
        const which = cell.super ? `중첩칸 ${s === 0 ? '위쪽' : '아래쪽'} 숫자` : '숫자';
        slot.setAttribute('aria-label', `${position(i)} ${which}: ${v ?? '비어 있음'}`);
        slot.setAttribute('aria-pressed', isSel ? 'true' : 'false');
      });
    }

    refreshPlayCell(cell, node, i) {
      const btn = node.querySelector('.cell-btn');
      btn.querySelectorAll('.val').forEach((span, s) => {
        span.textContent = cell.values[s];
        const chosen = cell.marked && cell.result === cell.values[s];
        span.classList.toggle('is-chosen', chosen);
        span.classList.toggle('is-dropped', cell.super && cell.marked && !chosen);
      });
      node.classList.toggle('is-marked', cell.marked);
      node.classList.toggle('is-collapsed', cell.super && cell.marked);
      node.classList.toggle('is-win', this.winCells.has(i));

      let label = `${position(i)}, `;
      if (cell.super) {
        label += cell.marked
          ? `중첩칸, ${cell.result}(으)로 확정됨`
          : `중첩칸, ${cell.values[0]}과 ${cell.values[1]}이 중첩된 상태`;
      } else {
        label += `${cell.values[0]}${cell.marked ? ', 표시됨' : ''}`;
      }
      btn.setAttribute('aria-label', label);
    }

    /** 잘못 눌렀을 때 흔들기 */
    shake(i) {
      const node = this.cells[i];
      node.classList.remove('is-shake');
      void node.offsetWidth; // 애니메이션 다시 시작
      node.classList.add('is-shake');
    }
  }

  global.SBBoardView = BoardView;
})(window);
