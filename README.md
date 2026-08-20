# 펍지키우기포지마스터 (RETRO ROYALE)

웹 리메이크. **로컬 서버를 띄우지 않습니다.** GitHub Pages 정적 페이지가 곧 게임입니다. 매치는 Pixi.js(WebGL)로 그립니다.

**Play:** https://emptypizza.github.io/ppi/

원작: [gghf.itch.io/ppi](https://gghf.itch.io/ppi)

`index.html`을 `file://`로 열면 위 주소로 안내합니다. `python3 -m http.server` 나 Node WebSocket 호스트는 쓰지 않습니다.

`?solo=1` 이면 매칭을 건너뛰고 바로 1인+봇 9입니다.

## 멀티

브라우저끼리 PeerJS로 방을 잡습니다. 이 Mac을 서버로 쓰지 않습니다.

- 거의 동시에 **게임 시작**을 누른 사람이 한 방
- 정원 10, 빈자리는 봇
- 방장이 탭을 닫으면 그 판은 끝
- 사람이 안 들어오면 봇 9과 솔로처럼 시작

테스트:

```bash
npm test
```

## 조작

| 키 | 동작 |
|---|---|
| WASD / 방향키 | 이동 |
| 마우스 | 조준 |
| 클릭 | 공격 |
| Shift | 급강하 / 스프린트 |

상자 7개를 먹고 초록 웜홀로 탈출하세요.

매치가 끝나면 골드를 받고, 오른쪽 **훈련소**에서 영구 강화합니다.
