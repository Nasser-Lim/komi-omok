# 🐻 고미와 오목 한 판

![version](https://img.shields.io/badge/KOMI-v1.0.0-1d8cf0) ![engine](https://img.shields.io/badge/engine-B1-12286e) ![weights](https://img.shields.io/badge/weights-CC%20BY--NC%204.0-ffcc2e)

**KOMI · 오목 두는 고미** — 링크만 열면 바로 시작하는 오목 게임이에요.
설치도, 가입도 필요 없어요.

👉 **https://nasser-lim.github.io/komi-omok/**

## 버전

| 항목 | 내용 |
|---|---|
| KOMI | **v1.0.0** (2026-11-12) |
| 엔진 | B1 — 직선 패턴 신경망 + 몬테카를로 트리 탐색 |
| 가중치 | `a0-s0.lnw` (정책망) + `c64-s0.lnw` (값망) |

## 이런 걸 할 수 있어요

- **고미와 한 판** : 흑(선공)이나 백(후공)을 골라 고미와 겨뤄요. 고미가 생각하는 시간도 고를 수 있어요.
- **승률 막대** : 지금 누가 유리한지 한눈에 볼 수 있어요.
- **후보 수 · 예상 수순** : 고미가 좋다고 보는 자리와 앞으로의 진행을 보드 위에 보여 줘요.
- **내 수 평가** : 내가 둔 수가 좋았는지, 아쉬웠는지 알려 줘요.
- **온라인 대국 도우미** : 다른 사이트에서 두고 있는 실제 대국의 수를 입력하면, 다음에 둘 만한 수를 추천해 줘요.
- **렌주 규칙** : 흑은 3-3, 4-4, 6목 이상이 금지예요. 금지 자리는 ✕로 보여 줘요. 정확히 5목이면 흑이 이기고, 백은 5목 이상이면 이겨요.

## 처음 열 때 알아두세요

- 처음 한 번만 약 90MB를 내려받아요. **와이파이에서 열어 주세요.** 한 번 받으면 다음부터는 훨씬 빨리 열려요.
- 카카오톡 안에서 열면 매번 새로 받을 수 있어요. 화면 위 안내를 눌러 **크롬이나 사파리 같은 기본 브라우저로 열어 보세요.**
- 고미는 **내 폰이나 컴퓨터 안에서만** 생각해요. 내가 둔 수는 어디로도 전송되지 않아요.

## 🧠 고미 가중치 공개

고미의 "두뇌"인 신경망 가중치를 공개해요. 누구나 내려받아 써 볼 수 있어요.

| 파일 | 역할 | 크기 | SHA-256 |
|---|---|---|---|
| [`models/a0-s0.lnw`](models/a0-s0.lnw) | 정책망 — "어디에 둘까" 후보를 떠올려요 | 29,890,932 B | `9401326ef072a32502a8803cb8f1a7fca6e05287920f0e90b9e5e8e762301425` |
| [`models/c64-s0.lnw`](models/c64-s0.lnw) | 값망 — "지금 누가 유리한가"를 판단해요 | 59,978,100 B | `0815c5db2d022a36c2f5e8734a50a95226e71e17854808dc320d52573235d01e` |

- 두 파일은 **함께** 써야 해요. 정책망이 후보를 고르고, 값망이 판세를 평가해요.
- 렌주 규칙(15×15, 흑 금수 적용) 전용이에요.
- `.lnw`는 KOMI 전용 형식이라, 이 저장소의 엔진(`engine.js` + `engine.wasm`)으로 읽어요.

### 내려받기

```bash
git clone https://github.com/Nasser-Lim/komi-omok.git
```

또는 파일 주소로 바로 받아도 돼요.

```
https://nasser-lim.github.io/komi-omok/models/a0-s0.lnw
https://nasser-lim.github.io/komi-omok/models/c64-s0.lnw
```

### 사용법 (Node.js 예제)

저장소 폴더 안에 아래 파일을 `play.js`로 저장하고 `node play.js`로 실행해 보세요. (Node.js 18 이상)

```js
const fs = require('fs');
const EngineModule = require('./engine.js');
const { createB1 } = require('./b1core.js');

(async () => {
  // 고미 깨우기: 정책망 + 값망
  const gomi = await createB1(EngineModule,
    fs.readFileSync('models/a0-s0.lnw'), fs.readFileSync('models/c64-s0.lnw'));

  // 15×15 판: 칸 번호 = 행 × 15 + 열 (왼쪽 위가 0)
  // 값: 0 빈칸, 1 흑, 2 백
  const board = new Array(225).fill(0);
  board[7 * 15 + 7] = 1;   // 흑 H8 (가운데)
  board[7 * 15 + 8] = 2;   // 백 I8

  gomi.setPosition(board, 1);       // 1 = 흑 차례, 2 = 백 차례
  const r = gomi.search(1000, 2);   // 1초 동안 생각, 지금까지 둔 수 = 2

  const col = 'ABCDEFGHIJKLMNO'[r.action % 15], row = 15 - Math.floor(r.action / 15);
  const win = Math.round((r.cands[0].q + 1) * 50);
  console.log(`고미의 수: ${col}${row} · 둘 차례 쪽 승률 ${win}% · 읽은 국면 ${r.evals}개`);
})();
```

실행하면 이런 결과가 나와요(생각 시간에 따라 조금씩 달라요).

```
고미의 수: J9 · 둘 차례 쪽 승률 73% · 읽은 국면 6809개
```

### 쓸 수 있는 기능

| 함수 | 하는 일 |
|---|---|
| `setPosition(board, toMove)` | 판과 둘 차례를 정해요 |
| `search(ms, ply)` | `ms` 밀리초 동안 생각해서 다음 수를 골라요. `action`(칸 번호), `cands`(후보 목록: 칸 `a`, 방문 수 `visits`, 승률 값 `q`), `evals`(읽은 국면 수)를 돌려줘요 |
| `forbidden()` | 흑 차례일 때 금지 자리(3-3, 4-4, 6목)를 칸마다 1/0으로 알려 줘요 |
| `evaluate()` | 생각 없이 첫인상만 봐요. `policy`(칸별 확률), `value`(판세 −1~+1) |

승률 값(`q`, `value`)은 −1~+1 범위이고, 둘 차례인 쪽 기준이에요. `(값 + 1) ÷ 2`를 하면 승률처럼 읽을 수 있어요. 정확한 확률은 아니니 참고용으로 봐 주세요.

## 📜 사용 조건

- **가중치(`models/` 폴더의 `.lnw` 파일)** 는 **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.ko)** 으로 공개해요.
  - **출처를 밝히면** 자유롭게 쓰고, 고치고, 나눌 수 있어요.
  - **비상업적 용도로만** 쓸 수 있어요. 돈을 버는 서비스·제품에 쓰려면 먼저 문의해 주세요.
  - 출처 표기 예시: `KOMI 고미 가중치 v1.0.0 (https://github.com/Nasser-Lim/komi-omok), CC BY-NC 4.0`
- 그 밖의 파일(페이지, 엔진 실행 파일, 이미지)은 따로 허락하지 않은 한 모든 권리를 보유해요.

## 참고

- 승률은 고미가 보는 느낌을 숫자로 바꾼 값이에요. 정확한 확률은 아니니 재미로 봐 주세요.
- 온라인 대국 도우미는 연습이나 복기용으로 써 주세요. 사이트에 따라 대국 중 AI 도움을 금지하는 곳도 있어요.

만든 사람 : 임태우 · eight@sbs.co.kr
