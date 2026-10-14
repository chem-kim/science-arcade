/* 대전 공통: 순위 계산과 순위·시상대 그리기 (교사·학생 화면이 함께 씀) */
(function (global) {
  'use strict';

  const E = global.ERElements;
  const { escapeHtml, hearts } = global.ERUI;
  const MEDAL = ['🥇', '🥈', '🥉'];
  const LIVES = 5;
  const COUNTDOWN_MS = 4000;

  /** 점수 → 맞힌 수 → 오답이 적은 순. 모두 같으면 공동 순위 */
  function rank(entries) {
    const sorted = [...entries].sort((a, b) => b.score - a.score || b.correct - a.correct || a.wrong - b.wrong);
    let prev = null;
    return sorted.map((e, i) => {
      const same = prev && prev.score === e.score && prev.correct === e.correct && prev.wrong === e.wrong;
      const r = { ...e, rank: same ? prev.rank : i + 1 };
      prev = r;
      return r;
    });
  }

  function settingsLabel(s) {
    const lv = E.LEVELS[s.level];
    const min = s.duration >= 60 ? `${Math.floor(s.duration / 60)}분${s.duration % 60 ? ` ${s.duration % 60}초` : ''}` : `${s.duration}초`;
    return `${lv.label} ${lv.desc} · ${E.QTYPES[s.qtype].label} · ${min}`;
  }

  const meCls = (pid, me) => (pid === me ? 'is-me' : '');

  function renderLive(list, ranking, me) {
    const top = Math.max(1, ...ranking.map(r => r.score));
    list.innerHTML = ranking.map(r => `
      <li class="${r.rank === 1 && r.score > 0 ? 'is-top' : ''} ${r.done ? 'is-done' : ''} ${r.online === false ? 'is-offline' : ''} ${meCls(r.pid, me)}">
        <span class="r">${r.rank <= 3 && r.score > 0 ? MEDAL[r.rank - 1] : r.rank}</span>
        <span class="n">${escapeHtml(r.name)}</span>
        <span class="bar"><span style="transform:scaleX(${r.score / top})"></span></span>
        <span class="s">${r.score}</span>
        <span class="h">${r.done ? '끝 · ' : ''}${hearts(r.lives, LIVES)}</span>
      </li>`).join('') || '<li class="muted">참가자가 없어요</li>';
  }

  function renderChampion(box, results, me) {
    const winners = results.filter(r => r.rank === 1 && r.score > 0);
    box.hidden = !winners.length;
    if (!winners.length) return;
    const mine = winners.some(w => w.pid === me);
    box.innerHTML = `
      <div class="crown" aria-hidden="true">🏆</div>
      <p class="label">${mine ? '축하해요! 내가 우승!' : winners.length > 1 ? '공동 우승' : '우승'}</p>
      <p class="who">${winners.map(w => escapeHtml(w.name)).join(' · ')}</p>
      <p class="pts">${winners[0].score}점 · 원소 ${winners[0].correct}개</p>`;
  }

  function renderPodium(box, results, me) {
    box.innerHTML = [2, 1, 3].map(rk => {
      const g = results.filter(r => r.rank === rk);
      return `<div class="step step-${rk}">
        <div class="names">${g.length ? g.map(w => `<span class="${meCls(w.pid, me)}">${escapeHtml(w.name)}</span>`).join('') : '<span class="muted">-</span>'}</div>
        <div class="block"><span class="medal">${MEDAL[rk - 1]}</span><span>${rk}등</span>${g.length ? `<small>${g[0].score}점</small>` : ''}</div>
      </div>`;
    }).join('');
  }

  function renderTable(tbody, results, me) {
    tbody.innerHTML = results.map(r => `<tr class="${meCls(r.pid, me)}">
      <td>${r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}</td><td>${escapeHtml(r.name)}</td>
      <td>${r.score}</td><td>${r.correct}</td><td>${r.wrong}</td><td>${r.maxCombo || 0}</td></tr>`).join('');
  }

  /** 여러 학생이 놓친 원소 집계 → 많이 놓친 순 */
  function hardest(missedLists, n = 6) {
    const count = {};
    missedLists.forEach(list => list.forEach(z => { count[z] = (count[z] || 0) + 1; }));
    return Object.entries(count).map(([z, c]) => ({ z: Number(z), count: c }))
      .sort((a, b) => b.count - a.count || a.z - b.z).slice(0, n);
  }

  global.ERBattle = { rank, settingsLabel, renderLive, renderChampion, renderPodium, renderTable, hardest, LIVES, COUNTDOWN_MS, MEDAL };
})(window);
