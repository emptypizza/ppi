# 펍지키우기포지마스터 (RETRO ROYALE)

웹 리메이크. **로컬 서버를 띄우지 않습니다.** GitHub Pages 정적 페이지가 곧 게임입니다. 매치는 Pixi.js(WebGL)로 그립니다.

**Play:** https://emptypizza.github.io/ppi/

원작: [gghf.itch.io/ppi](https://gghf.itch.io/ppi)

`index.html`을 `file://`로 열면 위 주소로 안내합니다. `python3 -m http.server` 나 Node WebSocket 호스트는 쓰지 않습니다.

**게임 시작**은 대기 없이 바로 1인+봇 9입니다. 로컬 서버·매칭 대기 없음.

매치 HUD의 **자동전투** 토글로 WASD/클릭 없이 강하·자기장·파밍·전투를 돌립니다. 끄면 직접 조작입니다.

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
