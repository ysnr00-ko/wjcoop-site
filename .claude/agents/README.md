# 역할별 AI 에이전트

법인 업무관리시스템을 만들 때 분야별로 일을 나눠 맡기기 위한 에이전트 모음입니다.
Claude Code가 이 폴더의 에이전트를 자동으로 인식합니다.

| 분야 | 에이전트 | 맡는 일 |
|---|---|---|
| 디자인 | `ui-designer` | 화면 구성, 레이아웃, 컴포넌트·디자인 시스템 |
| 디자인 | `accessibility-expert` | 웹 접근성(WCAG), 키보드·스크린리더 대응 |
| 프론트엔드 | `frontend-developer` | 화면 구현, 반응형, 상태 관리 |
| 백엔드 | `backend-architect` | API 설계, 로그인·권한, 서버 구조 |
| 데이터베이스 | `database-architect` | 테이블 설계, DB 선택, 마이그레이션 |
| 품질(QA) | `test-automator` | 테스트 작성과 자동화 |
| 품질(QA) | `code-reviewer` | 코드 리뷰, 버그·성능 점검 |
| 보안 | `security-auditor` | 보안 점검, 개인정보 보호 |

## 사용법

대화에서 역할을 지정해 요청하면 됩니다.

- "ui-designer한테 업무 목록 화면 디자인 맡겨줘"
- "database-architect로 업무·담당자·결재 테이블 설계해줘"
- "security-auditor로 로그인 기능 점검해줘"

## 출처

[wshobson/agents](https://github.com/wshobson/agents) (커밋 `c96b5f6`, MIT 라이선스 — `LICENSE-wshobson-agents` 참고)에서 가져왔습니다.
이름을 짧게 바꾸고 `model`을 `inherit`(세션 모델 사용)로 통일한 것 외에는 원문 그대로입니다.
