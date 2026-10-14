/*
 * 중첩 빙고 — 시뮬레이션 실험실
 * 같은 규칙(rules.js)으로 빙고를 수천 판 자동 플레이하고, 빙고까지 걸린 측정 횟수를 비교한다.
 */
(function () {
  'use strict';

  const R = window.SBRules;
  const { $, escapeHtml } = window.SBUI;

  // 개수 실험: 개수가 많을수록 진해지는 한 색 계열 (색각이상 검사 통과)
  const COUNT_OPTIONS = [0, 2, 4, 6, 10];
  const COUNT_DEFAULT = [0, 2, 4, 6];
  const COUNT_COLOR = { 0: '#86b6ef', 2: '#5598e7', 4: '#2a78d6', 6: '#1c5cab', 10: '#0d366b' };
  // 위치 실험: 서로 다른 세 색 (색각이상 검사 통과)
  const PLACES = [
    { key: 'random', label: '아무 데나', color: '#2a78d6' },
    { key: 'diag', label: '대각선 위', color: '#eb6834' },
    { key: 'offdiag', label: '대각선 밖', color: '#1baf7a' },
  ];
  const CHUNK = 1000;

  const radio = name => document.querySelector(`input[name="${name}"]:checked`);
  const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
  let last = null; // 마지막 결과 (화면 크기 바뀌면 다시 그림)

  // ---------- 설정 화면 ----------

  $('#count-pills').innerHTML = COUNT_OPTIONS.map(k => `
    <label class="pill"><input type="checkbox" name="count-k" value="${k}" ${COUNT_DEFAULT.includes(k) ? 'checked' : ''}>
    <span><i class="swatch" style="background:${COUNT_COLOR[k]}"></i>${k}개</span></label>`).join('');

  document.querySelectorAll('.mini').forEach(m => {
    const diag = new Set(R.DIAGONAL);
    m.innerHTML = R.range(0, R.CELL_COUNT - 1).map(i => {
      const on = m.dataset.place === 'diag' ? diag.has(i) : !diag.has(i);
      return `<span class="${on ? 'on' : ''}"></span>`;
    }).join('');
  });

  function syncMode() {
    const place = radio('exp').value === 'place';
    $('#opt-count').hidden = place;
    $('#opt-place').hidden = !place;
    $('#predict-count').hidden = place;
    $('#predict-place').hidden = !place;
  }
  document.querySelectorAll('input[name="exp"]').forEach(r => r.addEventListener('change', syncMode));
  syncMode();

  // ---------- 실행 ----------

  function plan() {
    const trials = Number(radio('trials').value);
    if (radio('exp').value === 'place') {
      const k = Number(radio('place-k').value);
      return {
        mode: 'place', k, trials,
        series: PLACES.map(p => ({ key: p.key, label: p.label, color: p.color, k, place: p.key })),
      };
    }
    const ks = [...document.querySelectorAll('input[name="count-k"]:checked')].map(i => Number(i.value));
    return {
      mode: 'count', trials,
      series: ks.map(k => ({ key: String(k), label: `중첩칸 ${k}개`, color: COUNT_COLOR[k], k, place: 'random' })),
    };
  }

  async function run() {
    const p = plan();
    if (p.series.length < 2) return SBUI.toast('비교하려면 2개 이상 골라 주세요.');
    const btn = $('#btn-run');
    const bar = $('#progress');
    btn.disabled = true;
    bar.hidden = false;
    const total = p.series.length * p.trials;
    let done = 0;

    for (const s of p.series) {
      s.counts = new Array(R.MAX_NUMBER + 1).fill(0);
      let sum = 0;
      for (let t = 0; t < p.trials; t += CHUNK) {
        const n = Math.min(CHUNK, p.trials - t);
        for (let j = 0; j < n; j++) {
          const c = R.simulateOnce(s.k, s.place);
          s.counts[c]++;
          sum += c;
        }
        done += n;
        bar.firstElementChild.style.transform = `scaleX(${done / total})`;
        await new Promise(requestAnimationFrame);
      }
      s.mean = sum / p.trials;
      s.dist = s.counts.map(c => c / p.trials);
    }

    btn.disabled = false;
    bar.hidden = true;
    last = p;
    render(p);
  }

  // ---------- 결과 ----------

  function render(p) {
    $('#empty').hidden = true;
    $('#results').hidden = false;
    renderVerdict(p);
    renderTiles(p);
    renderLegend(p);
    renderChart(p);
    renderTable(p);
    renderExplain(p);
  }

  function renderVerdict(p) {
    let actual, text;
    if (p.mode === 'count') {
      const sorted = p.series.slice().sort((a, b) => a.k - b.k);
      const first = sorted[0];
      const lastS = sorted[sorted.length - 1];
      const diff = first.mean - lastS.mean;
      actual = diff > 0.3 ? 'faster' : diff < -0.3 ? 'slower' : 'same';
      text = `중첩칸 ${first.k}개 → ${lastS.k}개: 평균 <b>${first.mean.toFixed(1)}번</b> → <b>${lastS.mean.toFixed(1)}번</b>`
        + (actual === 'faster' ? ` (약 ${diff.toFixed(1)}번 빨라짐)` : '');
      const guess = radio('guess-count');
      const label = { faster: '빨라진다', same: '비슷하다', slower: '늦어진다' };
      $('#verdict').innerHTML = verdictHtml(guess && guess.value, actual, label, text);
    } else {
      const best = p.series.slice().sort((a, b) => a.mean - b.mean)[0];
      actual = best.key;
      text = `가장 빠른 위치: <b>${best.label}</b> (평균 ${best.mean.toFixed(1)}번)`;
      const guess = radio('guess-place');
      const label = Object.fromEntries(PLACES.map(x => [x.key, x.label]));
      $('#verdict').innerHTML = verdictHtml(guess && guess.value, actual, label, text);
    }
  }

  function verdictHtml(guess, actual, label, text) {
    if (!guess) return `<p class="v-title">결과</p><p>${text}</p><p class="muted small">예측을 고르지 않았어요. 다음엔 먼저 예측해 봐요!</p>`;
    const ok = guess === actual;
    return `<p class="v-title ${ok ? 'ok' : 'no'}">${ok ? '🎉 예측 성공!' : '🤔 예측과 달라요'}</p>
      <p>내 예측: <b>${label[guess]}</b> · 실제: <b>${label[actual]}</b></p><p>${text}</p>`;
  }

  function renderTiles(p) {
    $('#tiles').innerHTML = p.series.map(s => `
      <div class="tile">
        <p class="tile-label"><i class="swatch" style="background:${s.color}"></i>${escapeHtml(s.label)}</p>
        <p class="tile-value">${s.mean.toFixed(1)}<small>번째</small></p>
        <p class="tile-sub">판 위 숫자 ${R.CELL_COUNT + s.k}개</p>
      </div>`).join('');
  }

  function renderLegend(p) {
    $('#legend').innerHTML = p.series.map(s =>
      `<span><i class="swatch line" style="background:${s.color}"></i>${escapeHtml(s.label)}</span>`).join('');
  }

  /** 분포 선 그래프 (SVG) + 십자선 툴팁 */
  function renderChart(p) {
    const box = $('#chart');
    const W = Math.max(300, box.clientWidth);
    const H = W < 480 ? 240 : 300;
    const m = { l: 44, r: 14, t: 18, b: 40 };
    const xs = R.range(1, R.MAX_NUMBER).filter(x => p.series.some(s => s.dist[x] > 0));
    const x0 = Math.min(...xs);
    const x1 = R.MAX_NUMBER;
    const yMaxRaw = Math.max(...p.series.flatMap(s => s.dist));
    const step = yMaxRaw > 0.12 ? 0.04 : 0.02;
    const yMax = Math.ceil(yMaxRaw / step) * step;
    const X = x => m.l + ((x - x0) / (x1 - x0)) * (W - m.l - m.r);
    const Y = y => H - m.b - (y / yMax) * (H - m.t - m.b);

    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="빙고까지 걸린 측정 횟수별 판의 비율 그래프">`;
    for (let y = 0; y <= yMax + 1e-9; y += step) {
      svg += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(y)}" y2="${Y(y)}"/>`;
      svg += `<text class="tick" x="${m.l - 8}" y="${Y(y) + 4}" text-anchor="end">${Math.round(y * 100)}%</text>`;
    }
    svg += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    for (let x = Math.ceil(x0 / 5) * 5; x <= x1; x += 5) {
      svg += `<text class="tick" x="${X(x)}" y="${H - m.b + 18}" text-anchor="middle">${x}</text>`;
    }
    svg += `<text class="axis-title" x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle">빙고한 측정 번째</text>`;

    p.series.forEach(s => {
      const d = R.range(x0, x1).map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(s.dist[x]).toFixed(1)}`).join('');
      svg += `<path class="series" d="${d}" stroke="${s.color}"/>`;
    });

    // 직접 라벨: 4개 이하일 때, 선들이 잘 갈라지는 오른쪽 내리막(평균 + 4번째)에 (겹치면 아래로 밀기)
    if (p.series.length <= 4) {
      const labels = p.series.map(s => {
        const lx = Math.min(x1 - 3, Math.round(s.mean) + 4);
        return { s, x: X(lx), y: Y(s.dist[lx]) };
      }).sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) {
        if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
      }
      labels.forEach(l => {
        const short = l.s.label.replace('중첩칸 ', '');
        svg += `<circle cx="${l.x + 10}" cy="${l.y - 4}" r="4" fill="${l.s.color}"/>`;
        svg += `<text class="dlabel" x="${l.x + 18}" y="${l.y}">${escapeHtml(short)}</text>`;
      });
    }

    svg += `<g class="hover" visibility="hidden"><line class="cross" y1="${m.t}" y2="${H - m.b}"/>`
      + p.series.map((s, i) => `<circle class="hdot" data-i="${i}" r="5" fill="${s.color}"/>`).join('') + '</g>';
    svg += `<rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/>`;
    svg += '</svg><div class="tooltip" hidden></div>';
    box.innerHTML = svg;

    const g = box.querySelector('.hover');
    const tip = box.querySelector('.tooltip');
    const hit = box.querySelector('.hit');
    const move = e => {
      const rect = hit.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width;
      const x = Math.round(x0 + rel * (x1 - x0));
      if (x < x0 || x > x1) return;
      g.setAttribute('visibility', 'visible');
      g.querySelector('.cross').setAttribute('x1', X(x));
      g.querySelector('.cross').setAttribute('x2', X(x));
      g.querySelectorAll('.hdot').forEach(c => {
        const s = p.series[c.dataset.i];
        c.setAttribute('cx', X(x));
        c.setAttribute('cy', Y(s.dist[x]));
      });
      tip.hidden = false;
      tip.innerHTML = `<p class="tt-title">${x}번째 측정에서 빙고</p>` + p.series.map(s =>
        `<p><i class="swatch" style="background:${s.color}"></i>${escapeHtml(s.label)}<b>${pct(s.dist[x])}</b></p>`).join('');
      const left = X(x) / W * box.clientWidth;
      tip.style.left = `${Math.min(Math.max(left, 90), box.clientWidth - 90)}px`;
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { g.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  }

  function renderTable(p) {
    const xs = R.range(1, R.MAX_NUMBER).filter(x => p.series.some(s => s.counts[x] > 0));
    $('#table').innerHTML = `<table>
      <thead><tr><th scope="col">빙고한 측정 번째</th>${p.series.map(s => `<th scope="col">${escapeHtml(s.label)}</th>`).join('')}</tr></thead>
      <tbody>${xs.map(x => `<tr><th scope="row">${x}</th>${p.series.map(s => `<td>${pct(s.dist[x])}</td>`).join('')}</tr>`).join('')}
      <tr class="sum"><th scope="row">평균</th>${p.series.map(s => `<td>${s.mean.toFixed(2)}번</td>`).join('')}</tr></tbody>
    </table>`;
  }

  function renderExplain(p) {
    if (p.mode === 'count') {
      const rows = p.series.slice().sort((a, b) => a.k - b.k).map(s => {
        const n = R.CELL_COUNT + s.k;
        return `<tr><th scope="row">${s.k}개</th><td>${n}개</td><td>${n}/35 = ${pct(n / R.MAX_NUMBER, 0)}</td></tr>`;
      }).join('');
      $('#explain').innerHTML = `<h2>왜 그럴까?</h2>
        <p>중첩칸 하나에는 숫자가 2개 들어가요. 그래서 중첩칸이 하나 늘 때마다 <b>판 위의 숫자</b>도 하나씩 늘어나요.</p>
        <table class="mini-table"><thead><tr><th scope="col">중첩칸</th><th scope="col">판 위 숫자</th><th scope="col">측정 한 번이<br>내 판에 걸릴 확률</th></tr></thead><tbody>${rows}</tbody></table>
        <p>중첩칸은 <b>두 가능성을 동시에 품고 있어서</b>, 둘 중 어느 숫자가 측정되어도 채워져요. 일반칸보다 채워질 확률이 2배(2/35)예요.</p>`;
      $('#questions').innerHTML = `
        <li>중첩칸이 2개씩 늘 때 평균은 얼마나 줄었나요? 일정하게 줄었나요?</li>
        <li>중첩칸이 10개면 1~35가 전부 판에 들어가요. 그래도 빙고까지 17번 넘게 걸리는 이유는 무엇일까요?</li>
        <li>분포 그래프에서 중첩칸이 많은 판의 그래프는 어느 쪽으로 이동했나요?</li>
        <li>판 수를 1,000판에서 20,000판으로 늘리면 그래프가 어떻게 달라지나요? 왜 그럴까요?</li>`;
    } else {
      $('#explain').innerHTML = `<h2>왜 그럴까?</h2>
        <p>빙고 줄은 가로 5줄, 세로 5줄, 대각선 2줄로 모두 12줄이에요. 칸마다 속한 줄의 수가 달라요.</p>
        <ul class="lines-list">
          <li><b>가운데 칸</b>: 가로·세로·대각선 2줄 = <b>4줄</b></li>
          <li><b>나머지 대각선 칸</b>: 가로·세로·대각선 1줄 = <b>3줄</b></li>
          <li><b>그 밖의 칸</b>: 가로·세로 = <b>2줄</b></li>
        </ul>
        <p>중첩칸은 빨리 채워지는 칸이에요. 여러 줄에 속한 자리에 두면 <b>여러 줄을 동시에</b> 앞당길 수 있어요.</p>`;
      $('#questions').innerHTML = `
        <li>세 위치 중 어디가 가장 유리했나요? 차이는 몇 번 정도였나요?</li>
        <li>중첩칸 개수를 2개 → 6개로 바꾸면 위치에 따른 차이가 커지나요, 작아지나요?</li>
        <li>실제 게임에서는 중첩칸 위치가 무작위로 정해져요. 중첩칸이 대각선 위에 배정되면 운이 좋은 걸까요? 얼마나?</li>`;
    }
  }

  $('#btn-run').addEventListener('click', run);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => last && renderChart(last), 150);
  });
})();
