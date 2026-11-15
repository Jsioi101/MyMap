# 내 지도

카카오맵 API로 만든 개인용 매장 즐겨찾기 웹앱 (PWA).
- 주소: https://jsioi101.github.io/MyMap/
- Google 로그인 → 즐겨찾기는 Supabase(TodoBoard 와 같은 프로젝트)에 계정별로 저장, 모든 기기에서 실시간 동기화
- TodoBoard 의 가입 승인(members / is_approved)을 같이 써서 승인된 계정만 사용 가능
- 저장소에는 공개용 키(카카오 JavaScript 키, Supabase publishable key)만 들어 있고, 데이터는 RLS 로 본인만 접근

## 처음 설정

1. Supabase SQL Editor 에서 `supabase/mymap.sql` 실행
2. Supabase → Authentication → URL Configuration → Redirect URLs 에 `https://jsioi101.github.io/MyMap/` 추가
3. 카카오 개발자 콘솔 → JavaScript SDK 도메인에 `https://jsioi101.github.io` 등록
4. Supabase SQL Editor 에서 `supabase/mymap_v2.sql` 실행 (카테고리 여러 개, 지역, 옵션 동기화)
5. Supabase SQL Editor 에서 `supabase/mymap_v3_shared.sql` 실행 (즐겨찾기를 승인된 회원 모두가 함께 보기)

## 함께 쓰기

- 즐겨찾기: 승인된 회원 모두가 같이 보고 추가·수정한다. 삭제는 추가한 사람 본인 또는 관리자만.
- 옵션(필터·지도 색감·아이콘·카테고리 색·지역·주유소 설정): 각자 따로 저장된다.
- 회원 승인은 TodoBoard 의 회원 관리에서 한다 (같은 Supabase 프로젝트).

## 주유소 가격 (선택)

⛽ 주유소 버튼은 반경 10km 주유소를 보여 준다. 가격 순 정렬은 오피넷 연결이 필요하고, 연결 전에는 카카오 장소 검색으로 가까운 순만 보여 준다.

1. 오피넷(opinet.co.kr) 오픈 API 인증키 발급
2. Supabase → Edge Functions → Deploy a new function → Via Editor → 이름 `opinet-around`, 내용은 `supabase/functions/opinet-around/index.ts`
3. Supabase → Edge Functions → Secrets 에 `OPINET_KEY` = 인증키

가게 정보 화면의 **네이버 검색 / 구글 검색** 버튼은 가게 이름 + 지역으로 각 검색 사이트를 새 창으로 연다.

## 네이버 지도 즐겨찾기 가져오기

옵션 › 네이버 지도 즐겨찾기 가져오기 에 네이버 지도 폴더 공유 링크(naver.me/…)를 넣으면 장소를 즐겨찾기로 가져온다.
서버 함수(`supabase/functions/opinet-around`, 주소 `rapid-endpoint`)가 링크를 따라가 공유 폴더 목록을 읽는다.
네이버 공식 API 가 아니라 공유 페이지가 쓰는 데이터 주소를 읽으므로, 네이버가 바꾸면 동작하지 않을 수 있다.
이름과 주소(또는 60m 이내 위치)가 같은 곳이 이미 있으면 내 지도 쪽을 유지하고 건너뛴다.

