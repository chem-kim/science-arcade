/* 화면 공통 도우미 */
(function (global) {
  'use strict';

  const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
  const $ = sel => document.querySelector(sel);

  function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('is-active', s.id === screenId));
    window.scrollTo(0, 0);
  }

  function toast(message, kind = '', ms = 3200) {
    const box = $('#toasts');
    if (!box) return;
    // 알림이 쌓여 빙고판을 가리지 않도록 최대 2개만 유지
    while (box.children.length >= 2) box.firstElementChild.remove();
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = message;
    box.append(node);
    setTimeout(() => node.classList.add('is-leaving'), ms);
    setTimeout(() => node.remove(), ms + 400);
  }

  function retrigger(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
  }

  const sub = n => String(n).split('').map(d => SUBSCRIPTS[d]).join('');
  const position = i => `${Math.floor(i / global.SBRules.SIZE) + 1}행 ${(i % global.SBRules.SIZE) + 1}열`;

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

  /** 1~35 측정 기록판 */
  function renderHistory(grid, calls) {
    grid.replaceChildren();
    const last = calls[calls.length - 1];
    global.SBRules.range(1, global.SBRules.MAX_NUMBER).forEach(n => {
      const d = document.createElement('span');
      d.className = 'h-num' + (calls.includes(n) ? ' is-called' : '') + (n === last ? ' is-last' : '');
      d.textContent = n;
      grid.append(d);
    });
  }

  global.SBUI = { $, show, toast, retrigger, sub, position, escapeHtml, bindActions, renderHistory };
})(window);
