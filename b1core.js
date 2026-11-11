// B1 = A0 정책망 + c64 값망, C++ PUCT (c_puct 1.5, FPU 0.2) 를 WebAssembly로 돌린다. 브라우저 워커와 Node에서 같이 쓴다.
const N = 15, N2 = N * N;

// 방금 둔 수(idx, color)로 5목(흑은 정확히 5, 백은 5 이상)이 됐는지. 예상 수순을 끝난 국면에서 멈추는 데 쓴다.
function winAt(b, idx, color) {
  const r = (idx / N) | 0, c = idx % N;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) { let rr = r + s * dr, cc = c + s * dc; while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === color) { n++; rr += s * dr; cc += s * dc; } }
    if (color === 1 ? n === 5 : n >= 5) return true;
  }
  return false;
}

async function createB1(EngineModule, a0Bytes, c64Bytes) {
  const M = await EngineModule();
  M.FS.writeFile('/a0.lnw', new Uint8Array(a0Bytes));
  M.FS.writeFile('/c64.lnw', new Uint8Array(c64Bytes));
  // 렌주 규칙 구조체: n, overline[3], double_three[3], double_four[3], strict_three, five_overrides (int32 12개)
  const rule = M._malloc(48);
  [15, 0, 2, 0, 0, 1, 0, 0, 1, 0, 1, 1].forEach((v, i) => M.setValue(rule + 4 * i, v, 'i32'));
  const path = (s) => { const p = M._malloc(s.length + 1); for (let i = 0; i < s.length; i++) M.HEAPU8[p + i] = s.charCodeAt(i); M.HEAPU8[p + s.length] = 0; return p; };
  const mk = (file) => {
    const h = M._ln_create(path(file), rule, 1);
    if (!h) throw new Error('weights: ' + M.UTF8ToString(M._ln_last_error()));
    return h;
  };
  const h = mk('/a0.lnw'), hv = mk('/c64.lnw');
  const rs = M._ln_set_value_net(h, hv);
  if (rs !== 0) throw new Error('value net attach failed ' + rs);

  const K = 8;
  const bBoard = M._malloc(N2), bFb = M._malloc(N2);
  const bInts = M._malloc(4 * 13), bDbl = M._malloc(8 * 2), bProf = M._malloc(8 * 5);
  const bCa = M._malloc(4 * K), bCp = M._malloc(8 * K), bCv = M._malloc(8 * K), bCq = M._malloc(8 * K), bPr = M._malloc(4 * K), bPl = M._malloc(4 * K);
  const bHalf = M._malloc(16), bReuse = M._malloc(32);
  const bLogit = M._malloc(4 * N2), bVal = M._malloc(4);

  function setPosition(board, toMove) {  // board: 길이 225, 0 빈칸 1 흑 2 백
    for (let i = 0; i < N2; i++) M.HEAP8[bBoard + i] = board[i];
    if (M._ln_set_position(h, bBoard, toMove) !== 0) throw new Error('bad position');
  }
  function forbidden() {
    M._ln_forbidden(h, bFb);
    return Array.from(M.HEAPU8.subarray(bFb, bFb + N2));
  }
  // 현재 평가기 국면에서 탐색한다. ply = 둔 수 개수. 값(value, q)은 모두 "그 국면에서 둘 차례인 쪽" 기준 -1~+1.
  function search(budgetMs, ply, evals = 1000000) {
    const t0 = Date.now();
    const ret = M._ln_search(h, BigInt(evals), 1.5, 0.2, BigInt(4 * evals + 16), budgetMs, K, ply, 0, 0, bInts, bDbl,
      bCa, bCp, bCv, bCq, bPr, bPl, bProf, 0, bHalf, 0n, 0, -1, bReuse, 0.0);
    if (ret !== 0) throw new Error('search failed ' + ret);
    const ints = new Int32Array(M.HEAP32.buffer, bInts, 13);
    const nc = ints[6];
    const cands = [];
    for (let k = 0; k < nc; k++) cands.push({ a: M.getValue(bCa + 4 * k, 'i32'), prior: M.getValue(bCp + 8 * k, 'double'), visits: Number(new BigInt64Array(M.HEAPU8.buffer, bCv + 8 * k, 1)[0]), q: M.getValue(bCq + 8 * k, 'double') });
    return { action: ints[0], evals: ints[1], depth: ints[9], nodes: ints[10], ms: Date.now() - t0, value: M.getValue(bDbl, 'double'), cands };
  }
  // 정책망 확률(합법 수 softmax)과 값망 평가를 한 번에 낸다. 현재 평가기 국면 기준.
  function evaluate() {
    M._ln_evaluate(h, bLogit, bVal);
    const lg = new Float32Array(M.HEAPU8.buffer, bLogit, N2);
    let mx = -1e30;
    for (let i = 0; i < N2; i++) if (lg[i] > -1e8 && lg[i] > mx) mx = lg[i];
    const p = new Array(N2).fill(0);
    let s = 0;
    for (let i = 0; i < N2; i++) if (lg[i] > -1e8) { p[i] = Math.exp(lg[i] - mx); s += p[i]; }
    if (s > 0) for (let i = 0; i < N2; i++) p[i] /= s;
    const v = new Float32Array(M.HEAPU8.buffer, bVal, 1)[0];
    return { policy: p, value: Math.tanh(v * 0.5) };
  }
  const top = (p, k) => p.map((x, i) => [x, i]).filter((t) => t[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, k).map((t) => ({ a: t[1], p: t[0] }));

  // 국면(board, toMove)의 분석. res는 이 국면에서 한 탐색 결과(없으면 호출 쪽에서 evals로 짧게 탐색).
  //  - policy: 정책망 확률 전체 / value: 값망 평가 / cands: 탐색 후보(방문 순)
  //  - cands[i].replies: 그 수를 둔 뒤 상대 정책 상위 3수 (정책망만, 탐색 없음), cands[i].after: 그 수 뒤 값망 평가(둔 쪽 기준)
  //  - pv: 첫 후보부터 양쪽이 번갈아 최선이라고 가정한 예상 수순 (각 수마다 pvEvals 평가로 짧게 탐색)
  function analyze(board, toMove, ply, res, opts = {}) {
    const nCand = opts.nCand || 5, pvLen = opts.pvLen || 6, pvEvals = opts.pvEvals || 500;
    setPosition(board, toMove);
    const base = evaluate();
    const cands = res.cands.slice().sort((a, b) => b.visits - a.visits).slice(0, nCand).map((c) => ({ ...c }));
    for (const c of cands) {
      const b2 = board.slice(); b2[c.a] = toMove;
      if (winAt(b2, c.a, toMove)) { c.win = true; c.replies = []; c.after = 1; continue; }
      setPosition(b2, 3 - toMove);
      const e = evaluate();
      c.replies = top(e.policy, 3);
      c.after = -e.value;
    }
    // 예상 수순: 가장 많이 방문한 수에서 시작
    const pv = [];
    if (cands.length && pvLen > 0) {
      let b2 = board.slice(), side = toMove, a = cands[0].a;
      for (let k = 0; k < pvLen; k++) {
        pv.push(a); b2[a] = side;
        if (winAt(b2, a, side)) break;
        side = 3 - side;
        setPosition(b2, side);
        if (k + 1 >= pvLen) break;
        const r = search(-1, ply + k + 1, pvEvals);
        a = r.action;
      }
    }
    setPosition(board, toMove);
    return { ply, toMove, value: res.value, base, evals: res.evals, depth: res.depth, ms: res.ms, cands, pv };
  }
  return { setPosition, forbidden, search, evaluate, analyze, M };
}
if (typeof module !== 'undefined') module.exports = { createB1, N, winAt };
