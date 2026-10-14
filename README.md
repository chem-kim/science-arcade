# SCIENCE ARCADE

과학 개념을 게임으로 배우는 수업용 웹 게임 모음입니다.

- 사이트: https://chem-kim.github.io/science-arcade/

## 게임

| 게임 | 개념 | 주소 |
|---|---|---|
| 중첩 빙고 | 양자 중첩과 측정 | [superposition-bingo/](superposition-bingo/) |
| 원소 비 | 주기율표 원소 기호 외우기 | [element-rain/](element-rain/) |

## 중첩 빙고 사용법

1. 교사: `superposition-bingo/host.html`에서 방을 만들고, 방 코드나 QR코드를 보여줍니다.
2. 학생: `superposition-bingo/play.html`에서 방 코드와 닉네임으로 입장합니다.
3. 혼자 연습: `superposition-bingo/` 첫 화면에서 "혼자 연습하기"를 누릅니다.
4. 시뮬레이션 실험실: `superposition-bingo/sim.html`에서 중첩칸 개수·위치에 따른 빙고 시점을 수천 판 시뮬레이션으로 비교합니다.

## 원소 비 사용법

1. 혼자 연습: `element-rain/`에서 범위(기초 1~20번 · 도전 · 마스터 전체 · 라틴어 특강)와 문제 유형을 고르고 시작합니다.
   - 놓친 원소는 기억 카드·오답 노트로 보여 주고, 다음 판에 더 자주 나옵니다. 외운 원소는 "내 원소 도감" 주기율표에 색칠됩니다(이 기기에만 저장).
2. 대전: 교사는 `element-rain/host.html`에서 방을 만들고 범위·문제·시간을 고릅니다. 학생은 `element-rain/play.html`로 입장합니다.
   - 모든 학생에게 같은 순서로 원소가 떨어지고, 실시간 순위와 우승자, "우리 반이 많이 놓친 원소"가 교사 화면에 나옵니다.

## 개발 메모

- 실시간 통신은 Firebase Realtime Database(`science-arcade-7388`)를 씁니다. 게임마다 데이터 경로를 나눕니다(예: `superposition-bingo/rooms`).
- `js/firebase-config.js`의 값은 브라우저에 공개되는 값입니다. 접근 제한은 `database.rules.json`이 담당합니다.
- 보안 규칙 배포: `firebase deploy --only database`
- Firebase 없이 테스트: 로컬 서버를 켜고 주소 끝에 `?net=local`을 붙이면, 같은 브라우저의 여러 탭끼리 통신합니다.
