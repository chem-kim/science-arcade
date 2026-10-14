/*
 * 원소 비 — 게임 엔진
 * 원소 카드가 위에서 떨어지고, 바닥에 닿기 전에 답을 입력하면 터진다.
 * 시간은 clock()(게임 시작 후 경과 ms)으로 계산하므로, 대전에서는 모두가 같은 시계를 쓴다.
 */
(function (global) {
  'use strict';

  const E = global.ERElements;

  /** 같은 씨앗이면 같은 수열 (대전에서 모두에게 같은 순서로 출제) */
  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 대전용 출제 순서: 최근 8개 안에서는 같은 원소가 다시 나오지 않음 */
  function battleSequence(pool, seed, count = 400) {
    const rng = seededRandom(seed);
    const out = [];
    for (let i = 0; i < count; i++) {
      const recent = out.slice(-Math.min(8, pool.length - 1)).map(o => o.z);
      const cands = pool.filter(z => !recent.includes(z));
      out.push({ z: cands[Math.floor(rng() * cands.length)], x: rng() });
    }
    return out;
  }

  const answerOf = (e, qtype) => (E.QTYPES[qtype].answerKind === 'symbol' ? e.symbol : e.name);
  const compact = s => s.replace(/\s+/g, '');

  function accepts(e, qtype, text) {
    if (E.QTYPES[qtype].answerKind === 'symbol') return text === e.symbol;
    const t = compact(text);
    return t === e.name || e.alts.includes(t);
  }

  class ERGame {
    /**
     * @param {object} o
     *   field, qtype, fallMs, lives, duration(ms|null), hint(bool)
     *   clock()            게임 시작 후 경과 ms (음수면 아직 시작 전)
     *   next(onScreenZs)   다음 원소 { z, x } (없으면 null → 다 내려보냄)
     *   on: { update(stats), end(stats, reason), feedback(text, kind), hit(z), miss(z) }
     */
    constructor(o) {
      Object.assign(this, o);
      this.on = o.on || {};
      this.tiles = [];
      this.stats = { score: 0, correct: 0, wrong: 0, combo: 0, maxCombo: 0, lives: o.lives, missed: [], hits: [] };
      this.nextSpawn = 0;
      this.exhausted = false;
      this.running = false;
      this.field.querySelectorAll('.tile, .float').forEach(n => n.remove());
    }

    start() {
      this.running = true;
      const tick = () => {
        if (!this.running) return;
        this.frame();
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
      this.emit();
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }

    /** 시간이 갈수록 빨라짐 (2분 뒤 약 절반) */
    pace(t) { return Math.max(0.42, Math.pow(0.97, Math.max(0, t) / 5000)); }

    frame() {
      const t = this.clock();
      if (t < 0) return;
      if (this.duration && t >= this.duration) return this.finish('time');

      // 새 원소: 화면이 비면 조금 일찍 내려보냄
      const f = this.pace(t);
      if (!this.tiles.length) this.nextSpawn = Math.min(this.nextSpawn, t + 400);
      if (!this.exhausted && t >= this.nextSpawn) {
        const item = this.next(this.tiles.map(x => x.z));
        if (item) this.spawn(item, t, this.fallMs * f);
        else this.exhausted = true;
        const gap = Math.max(950, 2600 * f);
        this.nextSpawn = this.nextSpawn < t - gap ? t + gap : this.nextSpawn + gap;
      }
      if (this.exhausted && !this.tiles.length) return this.finish('clear');

      const W = this.field.clientWidth;
      const H = this.field.clientHeight;
      for (const tile of [...this.tiles]) {
        const y = (t - tile.born) / tile.dur;
        if (y >= 1) { this.missTile(tile); continue; }
        tile.y = y;
        const tw = tile.el.offsetWidth;
        const th = tile.el.offsetHeight;
        tile.el.style.transform = `translate(${tile.x * Math.max(0, W - tw)}px, ${y * (H - th)}px)`;
        if (this.hint && !tile.hinted && y > 0.55) {
          tile.hinted = true;
          const ans = answerOf(E.BY_Z[tile.z], this.qtype);
          tile.el.querySelector('.t-hint').textContent = `${ans[0]}${ans.length > 1 ? '…' : ''}`;
          tile.el.classList.add('is-hinted');
        }
        tile.el.classList.toggle('is-danger', y > 0.75);
      }
      if (this.stats.lives <= 0) this.finish('lives');
    }

    spawn({ z, x }, t, dur) {
      const e = E.BY_Z[z];
      const el = document.createElement('div');
      el.className = `tile cat-${e.category}`;
      let main, sub = '';
      if (this.qtype === 'name2sym') { main = e.name; sub = e.alts[0] || ''; }
      else if (this.qtype === 'sym2name') main = e.symbol;
      else { main = String(e.z); sub = '번'; }
      el.innerHTML = `
        <span class="t-num">${this.qtype === 'num2sym' ? '' : e.z}</span>
        <span class="t-main"></span><span class="t-sub"></span><span class="t-hint"></span>`;
      el.querySelector('.t-main').textContent = main;
      el.querySelector('.t-sub').textContent = sub;
      if (main.length >= 5) el.classList.add('is-long');
      if (this.qtype === 'name2sym' || this.qtype === 'num2sym') el.classList.add('is-question');
      // 위에 막 생긴 카드와 겹치지 않게 가로 위치 조정 (모양만 바뀌고 출제 순서는 그대로)
      let xx = x;
      for (let k = 0; k < 6 && this.tiles.some(o => o.y < 0.25 && Math.abs(o.x - xx) < 0.22); k++) xx = (xx + 0.37) % 1;
      el.style.transform = `translate(${xx * Math.max(0, this.field.clientWidth - 100)}px, 0)`;
      this.field.append(el);
      this.tiles.push({ z, x: xx, y: 0, born: t, dur, el, hinted: false });
    }

    /** 입력한 답 처리. 맞히면 가장 아래에 있는 해당 카드를 터뜨림 */
    submit(raw) {
      const text = raw.trim();
      if (!text || !this.running || this.clock() < 0) return null;
      const hits = this.tiles.filter(tl => accepts(E.BY_Z[tl.z], this.qtype, text)).sort((a, b) => b.y - a.y);
      if (hits.length) {
        this.hitTile(hits[0]);
        return 'hit';
      }
      const kind = E.QTYPES[this.qtype].answerKind;
      // 대소문자만 틀림: 벌점 없이 알려주기
      if (kind === 'symbol') {
        const near = this.tiles.find(tl => E.BY_Z[tl.z].symbol.toLowerCase() === text.toLowerCase());
        if (near) {
          this.feedback(`대소문자! 원소 기호는 첫 글자만 대문자예요 → ${E.BY_Z[near.z].symbol}`, 'case');
          return 'case';
        }
      }
      this.stats.wrong++;
      this.stats.combo = 0;
      const other = kind === 'symbol'
        ? E.BY_SYMBOL[text] || E.BY_SYMBOL[text[0].toUpperCase() + text.slice(1).toLowerCase()]
        : E.LIST.find(e => accepts(e, 'sym2name', text));
      if (other) this.feedback(`${other.symbol} = ${E.displayName(other)} (${other.z}번) · 화면에 없는 원소예요`, 'wrong');
      else this.feedback(`'${text}' — 화면에 없는 답이에요`, 'wrong');
      this.emit();
      return 'wrong';
    }

    hitTile(tile) {
      this.remove(tile);
      const s = this.stats;
      s.correct++;
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      const speed = tile.hinted ? 0 : Math.round((1 - tile.y) * 10);
      const gain = 10 + speed + Math.min(s.combo - 1, 10) * 2;
      s.score += gain;
      s.hits.push(tile.z);
      tile.el.classList.add('is-hit');
      this.floatText(tile, `+${gain}${s.combo >= 3 ? ` · ${s.combo}콤보` : ''}`);
      setTimeout(() => tile.el.remove(), 450);
      if (this.on.hit) this.on.hit(tile.z, tile.hinted);
      this.emit();
    }

    missTile(tile) {
      this.remove(tile);
      const s = this.stats;
      s.lives--;
      s.combo = 0;
      if (!s.missed.includes(tile.z)) s.missed.push(tile.z);
      tile.el.classList.add('is-missed');
      setTimeout(() => tile.el.remove(), 600);
      this.field.classList.remove('is-hurt');
      void this.field.offsetWidth;
      this.field.classList.add('is-hurt');
      if (this.on.miss) this.on.miss(tile.z);
      this.emit();
    }

    remove(tile) { this.tiles = this.tiles.filter(x => x !== tile); }

    floatText(tile, text) {
      const f = document.createElement('div');
      f.className = 'float';
      f.textContent = text;
      const r = tile.el.getBoundingClientRect();
      const fr = this.field.getBoundingClientRect();
      f.style.left = `${r.left - fr.left + r.width / 2}px`;
      f.style.top = `${r.top - fr.top}px`;
      this.field.append(f);
      setTimeout(() => f.remove(), 900);
    }

    feedback(text, kind) { if (this.on.feedback) this.on.feedback(text, kind); }
    emit() { if (this.on.update) this.on.update(this.stats); }

    finish(reason) {
      if (!this.running) return;
      this.stop();
      this.tiles.forEach(tl => tl.el.classList.add('is-frozen'));
      if (this.on.end) this.on.end(this.stats, reason);
    }
  }

  /**
   * 입력칸 연결: Enter·스페이스·확인 버튼으로 제출.
   * 기호 문제는 화면의 답과 정확히 같고 헷갈릴 다른 답(N과 Na 등)이 없으면 바로 제출.
   * 한글 입력 중(조합 중) Enter는 조합이 끝난 뒤 제출한다.
   */
  function bindInput(input, button, getGame) {
    let submitAfterCompose = false;
    const submit = () => {
      const game = getGame();
      if (!game) return;
      const result = game.submit(input.value);
      input.value = '';
      if (result === 'wrong' || result === 'case') {
        input.classList.remove('is-shake');
        void input.offsetWidth;
        input.classList.add('is-shake');
      }
    };
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (e.isComposing || e.keyCode === 229) { submitAfterCompose = true; return; }
      submit();
    });
    input.addEventListener('compositionend', () => {
      if (submitAfterCompose) { submitAfterCompose = false; setTimeout(submit, 0); }
    });
    input.addEventListener('input', e => {
      const game = getGame();
      if (!game || e.isComposing || E.QTYPES[game.qtype].answerKind !== 'symbol') return;
      const v = input.value.trim();
      if (!v) return;
      const answers = game.tiles.map(tl => E.BY_Z[tl.z].symbol);
      if (answers.includes(v) && !answers.some(a => a !== v && a.startsWith(v))) submit();
    });
    if (button) button.addEventListener('click', () => { submit(); input.focus(); });
  }

  global.EREngine = { ERGame, bindInput, seededRandom, battleSequence, answerOf };
})(window);
