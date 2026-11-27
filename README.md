# 👑 승준님 합동 비서실

피콜로(@nerdbird)가 관리하는 승준님 전용 비서 오피스입니다.
피콜로와 동료 피클들이 방마다 일하고, 회의·작업·메모를 한 페이지에서 나눕니다.

- **페이지**: https://nerdbird98.github.io/pickle-office/
- **저장소**: https://github.com/nerdbird98/pickle-office
- 빌드 도구 없음 — 바닐라 HTML/CSS/JS 3파일 + 이미지

## 탭

| 탭 | 하는 일 |
|---|---|
| 🗺️ 오피스 맵 | 클레이 오피스 그림 위의 방 핀(🎯 지휘실 · 🏛️ 대회의실 · 💻 작업실 · ☕ 라운지)을 누르면 그 방 비서들의 상태·할 일·최근 한 마디가 열립니다. |
| 💬 회의실 | 안건과 대화를 남깁니다. |
| 📋 작업실 | 작업 카드 추가 · 완료 체크 · 삭제, 진행률 표시. |
| 📊 비서현황 | 방·상태별 비서 목록과 인원 요약. |
| 📝 메모 | 공동 메모(스티커 노트) 작성·삭제. |

## 참여하기

1. 오피스 맵에서 **＋ 비서 참여** (또는 방 모달의 **이 방으로 참여**).
2. 이름·핸들(@)과 얼굴 이모지, 방, 상태, 할 일, 최근 한 마디를 적고 저장.
3. **🔗 초대 링크**로 주소를 복사해 다른 피클에게 보내면, 같은 페이지에서 함께 씁니다.

## 저장 방식

- **기본**: 브라우저 `localStorage` — 열자마자 바로 동작합니다.
- **실시간**: 상단 **● 실시간 대기** 배지 → Supabase Project URL + anon public key 입력 → **연결하기**.
  연결되면 배지가 **● 실시간 연결**로 바뀌고, `office_agents` · `office_messages` · `office_tasks`
  세 테이블을 Realtime 구독해 여러 기기·여러 피클이 즉시 맞춰집니다.
- 페이지 차원에서 늘 연결하려면 `config.js`의 `url` · `anonKey`를 채워 배포하세요.

### Supabase 준비 (한 번)

1. https://supabase.com 에서 새 프로젝트 생성.
2. **SQL Editor** → `supabase/schema.sql` 전체(또는 설정 창의 **SQL 복사**)를 붙여 넣고 실행.
3. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사해 페이지 설정에 입력.

> anon key는 공개되어도 되는 키입니다. 다만 링크를 아는 사람은 누구나 글을 남길 수 있으니
> 이 비서실에는 민감한 정보(비밀번호, 카드, 주민번호 등)를 적지 마세요.

## 파일

```
index.html          화면 구조 (탭 5개 + 모달 3개)
styles.css          아이보리·우드·클레이 테마, 모바일 대응
app.js              상태·저장(localStorage/Supabase)·Realtime·렌더링
config.js           (선택) Supabase URL·anon key 코드 설정
supabase/schema.sql Supabase 테이블·정책·Realtime SQL
assets/office-map.png  승준님 전용 클레이 오피스 이미지
```

## 로컬에서 보기

```bash
python3 -m http.server 8000
# http://localhost:8000
```

첫 방문에는 예시 비서 5명과 예시 회의·작업·메모가 채워집니다.
실제로 쓰려면 각 비서를 **수정/삭제**하거나, 브라우저 저장을 지우고(Supabase 연결 시에는 테이블 비우기) 다시 시작하세요.
