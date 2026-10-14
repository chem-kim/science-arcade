/* 화면 공통 도우미 */
(function (global) {
  'use strict';

  const E = global.ERElements;
  const $ = sel => document.querySelector(sel);

  function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('is-active', s.id === screenId));
    window.scrollTo(0, 0);
  }

  function toast(message, kind = '', ms = 3200) {
    const box = $('#toasts');
    if (!box) return;
    while (box.children.length >= 2) box.firstElementChild.remove();
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = message;
    box.append(node);
    setTimeout(() => node.classList.add('is-leaving'), ms);
    setTimeout(() => node.remove(), ms + 400);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** [data-action] 버튼 클릭을 actions 객체로 연결 */
  function bindActions(actions) {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (btn && !btn.disabled && actions[btn.dataset.action]) actions[btn.dataset.action](btn);
    });
  }

  const hearts = (n, max) => '❤️'.repeat(Math.max(0, n)) + '🤍'.repeat(Math.max(0, max - n));

  /** 원소 카드 한 장 (기억 카드·오답 노트) */
  function noteCard(z, extra = '') {
    const e = E.BY_Z[z];
    return `<li class="note-card cat-${e.category}">
      <span class="nc-sym"><small>${e.z}</small>${e.symbol}</span>
      <span class="nc-body">
        <strong>${escapeHtml(E.displayName(e))}</strong> <span class="nc-en">${e.en}</span>
        <span class="nc-note">${escapeHtml(e.note || E.CATEGORY_LABEL[e.category])}</span>
      </span>${extra}
    </li>`;
  }

  /**
   * 주기율표 (도감). cellClass(z)로 칸마다 상태를 표시
   * pool 밖의 원소는 흐리게.
   */
  function renderTable(container, { pool, cellClass = () => '', title = z => '' }) {
    const cells = E.LIST.map(e => {
      const inPool = !pool || pool.includes(e.z);
      return `<span class="pt-cell cat-${e.category} ${inPool ? cellClass(e.z) : 'is-out'}"
        style="grid-row:${e.row};grid-column:${e.col}" title="${e.z} ${e.symbol} ${escapeHtml(E.displayName(e))}${title(e.z)}">
        <small>${e.z}</small>${e.symbol}</span>`;
    });
    // 란타넘족·악티늄족 자리 표시
    cells.push('<span class="pt-cell pt-gap" style="grid-row:6;grid-column:3">57-71</span>');
    cells.push('<span class="pt-cell pt-gap" style="grid-row:7;grid-column:3">89-103</span>');
    container.innerHTML = cells.join('');
  }

  /** 외움송 띠: 순서 모드에서 지금까지 맞힌 글자를 채움 */
  function renderSong(container, pool, done, current) {
    const zs = pool.filter(z => E.SONG[z]);
    container.hidden = !zs.length;
    container.innerHTML = zs.map((z, i) => `<span class="syl ${done.has(z) ? 'is-done' : ''} ${z === current ? 'is-now' : ''}"
      title="${E.BY_Z[z].name}">${E.SONG[z]}</span>${(i + 1) % 10 === 0 && i < zs.length - 1 ? '<i class="syl-break"></i>' : ''}`).join('');
  }

  global.ERUI = { $, show, toast, escapeHtml, bindActions, hearts, noteCard, renderTable, renderSong };
})(window);
