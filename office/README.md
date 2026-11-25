# 업무 시스템 (office)

원주협동사회경제네트워크 업무 시스템. 계획서는 [docs/plan.md](docs/plan.md).

## 지금까지 만든 것 — 0단계(기반)

- 로그인: 이메일+비밀번호, 구글 로그인, 비밀번호 재설정. **초대받은 이메일만** 들어올 수 있음.
- 초기 설정 마법사: 조직 정보 → 부서 → 직책 → 직원 초대 → 기본 결재선.
- 설정 화면(관리자만): 위 다섯 가지 + 인사발령, 비활성, 모든 기기 로그아웃, 변경 기록.
- 휴대폰 홈 화면 설치(PWA).
- 권한은 데이터베이스에서 막음. 테스트 101개: `supabase/tests/run.sh`

## 1단계 (진행 중)

- 1-1 전자결재 흐름: 지출결의서 · 품의서 · 출장/휴가 신청을 쓰고, 결재선을 미리 본 뒤 올린다.
  결재 · 반려(사유 필수) · 협조(이견은 의견만), 회수(결재자가 열어 보기 전까지), 반려 후 재기안. 아래 메뉴 **문서함**.
- 본인 결재: 결재선의 맨 위 결재자가 직접 올리거나, 관리자가 결재선에 **본인 결재 허용**을 켜 두면(설정 → 결재선) 혼자 결재로 끝낼 수 있다.

## 처음 설치하는 법 (담당자용)

아래 순서대로 하면 됩니다. 막히면 클로드 코드에 "README 설치 몇 번에서 막혔어"라고 말하세요.

### 1. Supabase 프로젝트 만들기 (무료)
1. supabase.com 에 가입하고 **New project**를 만든다. 지역은 **Northeast Asia (Seoul)**.
2. 데이터베이스 비밀번호는 안전한 곳에 적어 둔다 (코드나 채팅에 붙여넣지 않기).

### 2. 데이터베이스 표 만들기
1. 왼쪽 메뉴 **SQL Editor**를 연다.
2. `supabase/migrations/` 폴더의 파일을 **이름 순서대로** 하나씩 (지금 6개) 열어 내용 전체를 붙여넣고 **Run**.

### 3. 가입 막기와 주소 설정
1. **Authentication → Sign In / Providers**: *Allow new users to sign up* 을 **끈다**.
2. **Authentication → URL Configuration**
   - Site URL: 서비스 주소 (예: `https://업무주소`)
   - Redirect URLs에 `서비스주소/auth/callback`, `서비스주소/auth/confirm` 추가

### 4. 메일 양식 바꾸기 (Authentication → Emails)
- **Invite user** 양식의 링크 주소를 이렇게 바꾼다:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password`
- **Reset password** 양식의 링크 주소:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password`
- 참고: Supabase 기본 메일은 보낼 수 있는 양이 적고 받는 사람도 제한돼요. 직원 초대 전에 메일 발송 서비스(SMTP)를 연결해야 할 수 있어요.

### 5. 첫 관리자 만들기
SQL Editor에서 (이메일과 이름을 바꿔서) 실행:
```sql
insert into public.people (email, name, is_admin) values ('관리자이메일@example.com', '이름', true);
```
그다음 **Authentication → Users → Invite user**로 같은 이메일을 초대한다.
메일의 링크를 눌러 비밀번호를 정하면 초기 설정 마법사가 열린다.

### 6. 구글 로그인 (선택)
구글 클라우드에서 OAuth 클라이언트를 만들어 **Authentication → Sign In / Providers → Google**에 넣는다.
필요해지면 클로드 코드에 단계별 안내를 요청하세요.

### 7. 열쇠 넣기
`.env.example`에 있는 값 네 개를 배포 서비스의 **환경 변수** 화면에 넣는다.
값은 Supabase **Project Settings → API**에 있다. `SUPABASE_SERVICE_ROLE_KEY`는 관리자 열쇠이므로 절대 다른 곳에 붙여넣지 않는다.

## 개발자용

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev
# 권한 테스트 (로컬 PostgreSQL 필요)
PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
```
