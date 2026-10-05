# HRBIP

**HR Business Intelligence Partner**

기존 인사 자료를 확인·집계해 종합 인사 보고서와 추천 인터랙티브 대시보드를 만드는 HR 업무 지원 웹이다.

## 실행

```powershell
npm ci
npx playwright install chromium
npm run build
npm start
```

[HRBIP 열기](http://127.0.0.1:4173). 개발 모드: `npm run dev`. 별도 API 키·유료 서비스가 필요하지 않다.

## 현재 상태

- 기준일: 2026-10-05. **로컬 v0.1.2. 통합 XLSX 추천 연결·가독성 개선·2020~2026 기간 및 PPT 실파일 검증.**
- 사용자 확인: 내 컴퓨터에서 먼저 실행, 외부 배포·GitHub 공개는 별도 결정.
- 파일 입력→검증→집계→대시보드/보고서→편집→저장/템플릿/출력/지정 계정 공유 연결.
- 실제 로컬 인증·SQLite 저장. 공유는 같은 서버의 지정 계정만 접근.
- 초안은 규칙 기반. 외부 AI가 생성했다고 표시하지 않는다.
- React·TypeScript·Express·Node 24. 흰색·초록·연두, 추천 틀 편집.
- 지원 파일과 입력 계약에는 범위가 있다. 실제 회사 자료·운영 보안 검토는 별도.
- 가상 자료 코드 테스트 22개, 브라우저 시나리오 13개 확인. PowerPoint/Excel 실제 앱과 PDF 렌더 확인. 최근 실행 범위는 검증 문서 참고.
- 업무 메뉴는 워크스페이스에 통합했다. 결과 화면에서 저장 여부를 확인하고, 로그인 후 저장한 작업을 다시 열 수 있다. 비로그인 파일 출력은 계정 작업 저장과 다르다.

## 문서 안내

| 파일 | 역할 |
|---|---|
| [실행·계정·보관](docs/OPERATIONS.md) | 설치, 지원 파일, 저장·삭제, 공유 범위 |
| [구현 체크리스트](docs/IMPLEMENTATION.md) | 현재 구현 완료 범위 |
| [지표 정의](docs/METRICS.md) | 날짜·이력·중복·누락·단위·산식 |
| [설계 결정](docs/DECISIONS.md) | 기술·데이터·권한 선택 이유 |
| [검증 결과](docs/VALIDATION.md) | 실제 시험 결과와 미검증 범위 |
| [개선 목록](docs/IMPROVEMENTS.md) | 운영 준비와 향후 확장 |
| [샘플 목록](docs/SAMPLES.md) | 사용자 제공 150명·24개월 데이터, 집계 연결 기준과 XLSX 호환 처리 |
| [INTERVIEW_SUMMARY.md](INTERVIEW_SUMMARY.md) | 질문 1~17과 사용자 답변을 한 번에 확인 |
| [PRD.md](PRD.md) | 최신 기능·데이터 원칙·완료 기준·미정 사항 |
| [BUILD_PLAN.md](BUILD_PLAN.md) | 구현 요청 후 진행할 화면 흐름과 제작 순서 |
| [PROJECT_LOG.md](PROJECT_LOG.md) | 선택 이유와 변경 과정 |
| [WORKLOG.md](WORKLOG.md) | 날짜별 실제 수행 내역 |
| [가상 인사 데이터](docs/SYNTHETIC_DATA.md) | 180명·24개월의 Excel·CSV, 항목 정의, 집계 기준과 테스트 예시 |
| [초기 PRD 이미지](docs/images/HRBIP_PRD_overview_v0.1.png) | v0.1 당시 요약. 현재 요구사항과 일부 다름 |
| [이미지 제작 기록](docs/HRBIP_PRD_overview_prompt.md) | 초기 이미지의 생성·수정 프롬프트 |

초기 이미지는 원본 기록으로 보존한다. 하단의 3일 문구, 인원 중심 범위, 네이비·블루 색상은 현재 제작 기준이 아니다.

## 이어서 작업할 때

새 채팅에서는 이 폴더의 README, 질문·답변 정리, PRD, 제작 흐름, 프로젝트 기록, 작업일지를 먼저 읽도록 요청한다. 새 채팅이 파일을 읽지 않고 이전 대화를 자동으로 기억한다고 가정하지 않는다.

현재 구현 기준은 docs/IMPLEMENTATION.md, 실행 기준은 docs/OPERATIONS.md다. 다음 작업은 검증 결과의 미검증 범위와 개선 목록을 확인한 뒤 진행한다. 기존 작업·원본·비밀정보는 커밋하지 않는다. 별도 생성된 합성 데이터는 앱 내장 샘플과 구분한다.
