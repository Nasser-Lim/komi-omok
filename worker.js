importScripts('engine.js', 'b1core.js');
let b1 = null;
const CACHE = 'sbsb1-models-v1', SIZES = { 'models/a0-s0.lnw': 29890932, 'models/c64-s0.lnw': 59978100 };
// 가중치는 바뀌지 않으므로 Cache Storage에 직접 저장해 둔다 (HTTP 캐시가 작은 인앱 브라우저 대비). 크기가 다르면 버리고 다시 받는다.
async function fetchBytes(url, label) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) {}
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) {
        const buf = new Uint8Array(await hit.arrayBuffer());
        if (buf.length === SIZES[url]) { postMessage({ type: 'progress', label, got: buf.length, total: buf.length, cached: true }); return buf; }
        await cache.delete(url);
      }
    } catch (e) {}
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  const total = +r.headers.get('content-length') || SIZES[url] || 0, rd = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    parts.push(value); got += value.length;
    postMessage({ type: 'progress', label, got, total });
  }
  const out = new Uint8Array(got); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  if (cache && got === SIZES[url]) { try { await cache.put(url, new Response(out, { headers: { 'content-type': 'application/octet-stream' } })); } catch (e) {} }
  return out;
}
function analysis(m, r) {
  const an = b1.analyze(m.board, m.toMove, m.ply, r);
  an.sig = m.sig;
  postMessage({ type: 'analysis', an });
}
onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const a0 = await fetchBytes('models/a0-s0.lnw', '정책망');
      const c64 = await fetchBytes('models/c64-s0.lnw', '값망');
      b1 = await createB1(EngineModule, a0, c64);
      postMessage({ type: 'ready' });
    } else if (m.type === 'forbidden') {
      b1.setPosition(m.board, m.toMove);
      postMessage({ type: 'forbidden', sig: m.sig, fb: b1.forbidden() });
    } else if (m.type === 'search') {
      b1.setPosition(m.board, m.toMove);
      const r = b1.search(m.ms, m.ply);
      postMessage({ type: 'move', id: m.id, action: r.action, value: r.value, evals: r.evals, ms: r.ms });
      if (m.toMove === 2) {  // 사람이 흑이면 다음 국면의 금지 칸을 분석보다 먼저 보낸다 (이게 늦으면 금지 자리를 둘 수 있다)
        const b2 = m.board.slice(); b2[r.action] = m.toMove; b1.setPosition(b2, 1);
        postMessage({ type: 'forbidden', sig: m.sig ? m.sig + ',' + r.action : String(r.action), fb: b1.forbidden() });
      }
      if (m.analyze) analysis(m, r);  // 둔 수는 먼저 보내고, 후보·예상 수순 계산은 그 뒤에 한다
    } else if (m.type === 'hint') {  // 사람 차례의 국면을 짧게 탐색해 후보·평가를 낸다
      b1.setPosition(m.board, m.toMove);
      analysis(m, b1.search(m.ms, m.ply));
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
