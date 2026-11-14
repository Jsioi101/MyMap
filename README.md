# 내 매장 지도

카카오맵 API로 만든 개인용 매장 즐겨찾기 웹앱 (PWA).
- 주소: https://jsioi101.github.io/MyMap/
- Google 로그인 → 즐겨찾기는 Supabase(TodoBoard 와 같은 프로젝트)에 계정별로 저장, 모든 기기에서 실시간 동기화
- TodoBoard 의 가입 승인(members / is_approved)을 같이 써서 승인된 계정만 사용 가능
- 저장소에는 공개용 키(카카오 JavaScript 키, Supabase publishable key)만 들어 있고, 데이터는 RLS 로 본인만 접근

## 처음 설정

1. Supabase SQL Editor 에서 `supabase/mymap.sql` 실행
2. Supabase → Authentication → URL Configuration → Redirect URLs 에 `https://jsioi101.github.io/MyMap/` 추가
3. 카카오 개발자 콘솔 → JavaScript SDK 도메인에 `https://jsioi101.github.io` 등록
