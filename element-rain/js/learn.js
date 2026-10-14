/*
 * 외우기 도우미 — 원소별 기억 상태(라이트너 상자)와 문제 출제 가중치
 * 상자 0: 틀린 적 있음 → 자주 출제, 상자 3: 외움 → 가끔 출제
 * 기록은 이 기기(브라우저)에만 저장된다.
 */
(function (global) {
  'use strict';

  const KEY = 'er-mastery-v1';
  const BEST_KEY = 'er-best-v1';
  const WEIGHT = [5, 2.5, 1.2, 0.6];
  const UNSEEN = 2;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가(사생활 보호 모드 등) */ }
  }

  let mastery = read(KEY);

  function record(z, ok) {
    const m = mastery[z] || { box: 0, right: 0, miss: 0 };
    if (ok) { m.right++; m.box = Math.min(3, m.box + 1); }
    else { m.miss++; m.box = 0; }
    mastery[z] = m;
    write(KEY, mastery);
  }

  const get = z => mastery[z] || null;
  const weight = z => (mastery[z] ? WEIGHT[mastery[z].box] : UNSEEN);

  /** 가중치에 따라 하나 고르기 (화면에 있는 원소는 제외) */
  function pick(pool, exclude, rng = Math.random) {
    let cands = pool.filter(z => !exclude.includes(z));
    if (!cands.length) cands = pool;
    const total = cands.reduce((s, z) => s + weight(z), 0);
    let r = rng() * total;
    for (const z of cands) {
      r -= weight(z);
      if (r <= 0) return z;
    }
    return cands[cands.length - 1];
  }

  /** 외움(상자 2 이상) / 연습 중 / 아직 안 나옴 */
  function status(z) {
    const m = mastery[z];
    if (!m) return 'new';
    if (m.box >= 2) return 'known';
    return m.miss && m.box === 0 ? 'weak' : 'learning';
  }

  function summary(pool) {
    const out = { known: 0, learning: 0, weak: 0, new: 0, total: pool.length };
    pool.forEach(z => { out[status(z)]++; });
    return out;
  }

  function reset() { mastery = {}; write(KEY, mastery); }

  function best(key) { return read(BEST_KEY)[key] || 0; }
  function saveBest(key, score) {
    const all = read(BEST_KEY);
    if (score <= (all[key] || 0)) return false;
    all[key] = score;
    write(BEST_KEY, all);
    return true;
  }

  global.ERLearn = { record, get, pick, status, summary, reset, best, saveBest };
})(window);
