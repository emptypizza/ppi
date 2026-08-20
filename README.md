# 펍지키우기포지마스터 (RETRO ROYALE)

웹 리메이크. GitHub Pages에서 솔로로 바로 플레이되고, 로컬/서버를 켜면 **사람 멀티 + 빈자리는 봇**입니다.

**Play:** https://emptypizza.github.io/ppi/

원작: [gghf.itch.io/ppi](https://gghf.itch.io/ppi)

## 멀티 (.io 식)

- 방 정원 **10**
- 첫 사람이 들어오면 **2초** 동안 추가 입장
- 빈 슬롯은 봇이 채움 (사람 2명이면 봇 8)
- 강하가 시작되면 난입 불가
- 서버가 없거나 접속 실패면 **솔로 9봇**으로 폴백

### 로컬 멀티

터미널 두 개:

```bash
cd server && npm install && npm start   # ws://127.0.0.1:8787
python3 -m http.server 8080             # 레포 루트에서
```

브라우저 탭 두 개로 http://127.0.0.1:8080 를 열고 닉네임 입력 후 게임 시작.

원격 서버를 쓰면 Pages에 `?ws=wss://your-host` 를 붙이거나 콘솔에서 `localStorage.setItem('ppi_ws','wss://your-host')`.

## 조작

| 키 | 동작 |
|---|---|
| WASD / 방향키 | 이동 |
| 마우스 | 조준 |
| 클릭 | 공격 |
| Shift | 급강하 / 스프린트 |

상자 7개를 먹고 초록 웜홀로 탈출하세요. 자기장은 초당 90 데미지입니다.

매치가 끝나면 골드를 받고, 오른쪽 **훈련소**에서 HP/공격/이동/스테미나/운/방치/시작무기를 영구 강화합니다.

## GitHub Pages

`main` 루트가 배포됩니다. 멀티 서버는 Pages에 포함되지 않습니다 (`server/`).
