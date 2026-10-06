# HRBIP

**HR Business Intelligence Partner**

기존 인사 자료를 확인·집계해 종합 인사 보고서와 추천 인터랙티브 대시보드를 만드는 HR 업무 지원 웹이다.

**[공개 웹사이트에서 사용하기](https://hrbip.vercel.app)** · 로그인 없이 내 CSV/XLSX 또는 가상 샘플로 분석·편집·출력하는 포트폴리오 버전. 새로고침·탭 종료 전에 결과를 다운로드한다. 작업과 회사 양식은 서버에 저장하지 않는다. [현재 동작과 데이터 처리](docs/GUEST_MODE.md).

## 실행

```powershell
npm ci
npx playwright install chromium
npm run build
npm start
```

[HRBIP 열기](http://127.0.0.1:4173). 개발 모드: `npm run dev`. 별도 API 키·유료 서비스가 필요하지 않다.

Windows 로그인 때 서버를 자동으로 실행하려면 첫 빌드 후 아래 명령을 한 번 실행한다. 직접 실행한 `npm start`는 먼저 종료한다. 중지·재시작·등록 해제 방법은 [실행 안내](docs/OPERATIONS.md#windows에서-자동-실행)에 있다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local-server.ps1 -Action Install
```

## 제출·공개 범위

이 저장소는 **프로젝트 코드와 문서**를 제공한다. 위 `127.0.0.1` 주소는 실행한 컴퓨터에서만 열리며 공개 웹사이트 주소가 아니다. 계산 검증·내보내기·회사 양식 처리에는 Node.js 서버가 필요하므로 GitHub Pages에 정적 파일만 올리는 것으로 전체 서비스가 실행되지는 않는다.

제출용 공개 저장소: [yangrin327-tech/HRBIP](https://github.com/yangrin327-tech/HRBIP). 기본 브랜치는 `main`이다. 공개 웹 주소는 **https://hrbip.vercel.app**이다.

사용자의 이전 실습과 같은 **Vercel로 배포한다**. 처음 연결한 Supabase는 새 로그인 없는 버전에서 사용하지 않는다. 기존 로컬 SQLite와 Supabase 계정·작업은 삭제하지 않았고 공개 방문자에게 제공하지 않는다. 설정과 검증 이력은 [배포 안내](docs/DEPLOYMENT.md)에 기록한다.

- 실제 사용자 계정, 비밀번호, 저장 보고서, 업로드 원본, 로컬 DB, 환경설정 비밀값은 저장소에 포함하지 않는다.
- 내장 샘플은 가상 인사 자료다. 기본 샘플과 150명·24개월 샘플을 비로그인으로 체험할 수 있다.
- 초기 기획 문서는 당시 결정의 기록이다. 현재 기능은 아래 상태와 `docs/IMPLEMENTATION.md`를 기준으로 확인한다.
- 공개 후에도 코드를 수정하고 새 커밋을 올릴 수 있다. `main`에 push하면 Vercel이 자동으로 재배포하며, 빌드와 실제 URL의 상태를 확인한다. DB 스키마 변경은 별도 마이그레이션이 필요하다.

현재 작업 브랜치에서 변경을 커밋한 뒤 `git push origin HEAD:main`으로 제출 저장소를 갱신한다. 업로드 전에 `git diff --cached`로 포함 파일을 확인하고, 개인 자료를 담을 수 있는 모든 브랜치/태그의 일괄 업로드는 하지 않는다.

## 현재 상태

- 기준일: 2026-10-06. **로그인 없는 공개 버전. 회사 PPTX·Excel 양식 적용, 독립 계산 대조와 검증표.**
- 사용자 확인: 내 컴퓨터에서 먼저 실행. 2026-10-06 GitHub Public 제출과 외부 웹 배포를 요청했으며 이전 실습의 Vercel 방식을 선택했다.
- 파일 입력→검증→집계→대시보드/보고서→편집→PDF/PPTX/Excel 다운로드. 샘플도 같은 처리 과정을 거친다.
- 계정·서버 저장·지정 계정 공유·영구 템플릿은 사용자 요청에 따라 비활성화했다. 이전 세션이 있어도 공개 API에서 접근을 차단한다. 작업과 회사 양식은 현재 탭 메모리에만 유지한다.
- 초안은 규칙 기반. 외부 AI가 생성했다고 표시하지 않는다.
- React·TypeScript·Express·Node 24. 흰색·초록·연두, 추천 틀 편집.
- 지원 파일과 입력 계약에는 범위가 있다. 실제 회사 자료·운영 보안 검토는 별도.
- 업무 메뉴는 워크스페이스에 통합했다. **계산 기준 보기**와 **최종 확인·내보내기**에서 근거와 출력 내용을 검토한다. 탭을 닫기 전 다운로드하라는 안내를 제공한다.
- 같은 탭의 **새 자료로 반복 보고**는 이전 연결·단위·집계 설정을 다시 사용할 수 있다. 이전 직원 행·보고 문장은 비우고 새 자료를 검증한다.
- 최신 검증 결과는 WORKLOG와 배포 안내에 기록한다. 과거 계정 모드 검증 이력과 현재 공개 모드의 검증을 구분한다.

## 문서 안내

| 파일 | 역할 |
|---|---|
| [로그인 없는 버전](docs/GUEST_MODE.md) | 현재 흐름, 메모리 처리, 출력 한도, 중단한 계정 기능 |
| [실행·계정·보관](docs/OPERATIONS.md) | 설치, 지원 파일, 저장·삭제, 공유 범위 |
| [구현 체크리스트](docs/IMPLEMENTATION.md) | 현재 구현 완료 범위 |
| [회사 양식·계산 검증](docs/COMPANY_FORMATS.md) | 새 기능 사용법, 지원 형식, 한계, 구현 구조 |
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
| [초기 PRD 이미지](docs/images/HRBIP_PRD_overview_v0.1.png) | v0.1 당시 요약. 현재 요구사항과 일부 다름 |
| [이미지 제작 기록](docs/HRBIP_PRD_overview_prompt.md) | 초기 이미지의 생성·수정 프롬프트 |

초기 이미지는 원본 기록으로 보존한다. 하단의 3일 문구, 인원 중심 범위, 네이비·블루 색상은 현재 제작 기준이 아니다.

## 이어서 작업할 때

새 채팅에서는 이 폴더의 README, 질문·답변 정리, PRD, 제작 흐름, 프로젝트 기록, 작업일지를 먼저 읽도록 요청한다. 새 채팅이 파일을 읽지 않고 이전 대화를 자동으로 기억한다고 가정하지 않는다.

현재 구현 기준은 docs/IMPLEMENTATION.md, 실행 기준은 docs/OPERATIONS.md다. 다음 작업은 검증 결과의 미검증 범위와 개선 목록을 확인한 뒤 진행한다. 기존 작업·원본·비밀정보는 커밋하지 않는다. 별도 생성된 합성 데이터는 앱 내장 샘플과 구분한다.
