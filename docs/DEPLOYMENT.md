# HRBIP 외부 배포

## 현재 공개 모드 변경 — 2026-10-06

사용자 요청으로 로그인 없는 버전으로 전환했다. **아래의 계정·Supabase·분할 전송 설명은 이전 배포의 이력**이며 현재 공개 동작과 구분한다. 현재 기능·데이터 처리·용량 한도는 [GUEST_MODE.md](GUEST_MODE.md)를 따른다.

- Vercel 정적 화면 + Express 일회성 처리. 공개 `PUBLIC_DEMO=true`이면 계정과 DB를 사용하지 않는다. 기존 `DATABASE_URL`/`PGPASSWORD`가 남아 있어도 연결하지 않는다.
- 등록·로그인·작업/원본/공유/템플릿/임시 전송 API는 모두 403. `/api/me`는 `user:null, guestMode:true`, `/api/health`는 `storage:none`이다.
- 파일 업로드·검증·분석·편집·회사 양식 적용·PDF/PPTX/Excel은 비로그인으로 사용한다. 작업과 회사 양식은 탭 메모리에만 남는다.
- 큰 JSON은 gzip 전송: 압축 후 4MiB / 해제 후 40MiB. DB 조각 업로드는 사용하지 않는다.
- 기존 DB/계정/작업과 과거 배포를 삭제하거나 공개 전환하지 않았다. 과거 배포의 코드가 소급 변경되는 것은 아니다.
- 새 버전 실제 배포 확인 결과는 WORKLOG의 최신 항목을 참조한다.

## 이전 계정 버전 배포 이력

기준일: 2026-10-06. **가상 자료용 공개 배포 완료. 실제 HR 자료 운영 승인을 의미하지 않는다.**

- 공개 주소: **https://hrbip.vercel.app**
- 소스: `yangrin327-tech/HRBIP`의 `main` → Vercel `rin-de1d1/hrbip` 자동 배포.
- 기능 검증 배포: `963fb24`, Vercel `C5aR7or22BTkZ7JQKEygiuC9EfTu`.
- 온라인 로그인·저장은 로컬과 독립적이다. 사용자는 공개 사이트에서 새 계정을 만든다. 로컬 작업 4개는 이전하지 않았다.

## 선택한 방식

사용자가 이전 실습과 같은 배포 서비스를 요청했다. `day09` 실습 기록과 기존 계정의 `day09-saju` 프로젝트에서 **Vercel + Supabase**를 확인했다. Vercel Hobby 계정은 로그인되어 있고 HRBIP GitHub 저장소를 가져오는 화면까지 확인했다. Railway는 사용하지 않는다.

Supabase 로그인과 DB 비밀번호 설정, Vercel `PGPASSWORD` 입력은 사용자가 직접 완료했다. 서울 지역 무료 HRBIP 프로젝트에 전용 테이블 10개와 RLS를 적용했다. Vercel Hobby 운영 환경에서 실제 가입·저장·조회로 DB 연결을 확인했다. 기존 사주 프로젝트나 DB는 수정하지 않았다. 유료 플랜·결제는 사용하지 않았다.

## 구성

- 로컬: 기존 Node 24 + SQLite 경로 유지. 기존 사용자·작업을 외부로 자동 복사하지 않는다.
- 외부: Vercel의 Vite 정적 화면 + `api/index.ts` Express 함수, 별도 Supabase PostgreSQL.
- 기존 비밀번호 해시·세션·지정 계정 ACL을 유지한다. Supabase Auth로 계정을 자동 이전하지 않는다.
- `server/database.ts`가 저장소 차이를 처리한다. PostgreSQL 쿼리는 `hrbip` 스키마를 명시한다. SQL 연결 정보는 서버만 보유하고 브라우저 환경변수에 넣지 않는다.
- 서버 공유 API, 내보내기, 원본 내려받기는 기존 권한 검사를 거친다. 공유받은 사람은 원본 행·파일에 접근하지 못한다.
- DB 마이그레이션은 전용 스키마·테이블·인덱스·RLS를 만든다. 브라우저 역할에 스키마 사용/테이블 조회 권한을 주지 않는다. 서버 연결은 테이블 소유자 역할을 사용하므로 사용자별 권한은 서버에서 확인한다.

## 설정과 진행 순서

1. Supabase의 **무료 HRBIP 전용 프로젝트**를 준비한다. 기존 실습 DB에 적용하지 않는다. DB 비밀번호 설정은 계정 소유자가 수행한다.
2. 전용 DB의 트랜잭션 풀러 PostgreSQL 연결 URL을 서버 설정으로 준비한다. URL에 필요한 TLS 옵션을 포함하고 비밀번호의 특수문자를 URL 인코딩한다. 값을 채팅·Git·로그에 출력하지 않는다.
3. 로컬의 Git 제외 파일 `.env.deploy.local`에 `DATABASE_URL`을 준비한 뒤 다음 명령으로 스키마만 적용한다. 로컬 SQLite 자료는 이전하지 않는다.

```powershell
node scripts/migrate-postgres.mjs
```

4. Vercel에서 `yangrin327-tech/HRBIP`, 기본 브랜치 `main`, Vite, Node 24, 프로젝트 루트 `./`를 선택한다. `vercel.json`의 빌드/함수/경로 설정을 사용한다.
5. 아래 환경변수를 서버 환경에 설정한다. `APP_ORIGIN`이 없으면 Vercel 운영 환경의 `VERCEL_PROJECT_PRODUCTION_URL`을 사용하며, 미리보기 환경은 해당 배포의 `VERCEL_URL`을 사용한다. 임의 요청의 Host 헤더는 사용하지 않는다. DB 비밀번호는 URL에 넣는 대신 별도 `PGPASSWORD`로 입력할 수 있다. 운영 DB 비밀값을 Preview에 자동 복사하지 않는다.

| 이름 | 값 또는 의미 |
|---|---|
| `DATABASE_URL` | HRBIP 전용 PostgreSQL 연결 비밀값, TLS 사용 |
| `PGPASSWORD` | URL에 비밀번호를 넣지 않은 경우 사용하는 DB 비밀번호. 서버 전용 비밀값 |
| `APP_ORIGIN` | 선택: 실제 HTTPS 주소. 미지정 시 위 Vercel 시스템 환경변수 사용 |
| `COOKIE_SECURE` | `true` |
| `PUBLIC_DEMO` | `true` |
| `TRUST_PROXY_HOPS` | Vercel 프록시 경로 확인 후 `1` |

Vercel에 `DATA_DIR`를 지정해 임시 디스크를 영구 저장소처럼 사용하지 않는다. `VITE_DATABASE_URL` 등 브라우저로 노출되는 이름은 금지한다. 설정이 부족하면 서버가 시작을 거부한다.

6. 배포 후 실제 URL에서 아래 검증을 수행하고 완료 상태를 갱신한다. Vercel 생성 성공이나 Git push 성공만으로 배포 완료라고 표시하지 않는다.

## 큰 파일과 PDF

- Vercel의 일반 요청 본문 제한 때문에 3MiB 이상 JSON은 1MiB 조각으로 보낸다. 기존 요청 총량 40MiB, 보관 원본 파일당 10MiB·합계 20MiB 제한은 유지한다.
- 조각은 256비트 임의 토큰의 해시로 식별하고 로그인 세션·최종 API 경로에 연결한다. 잘못된 순서/크기, 세션 변경, 만료, 재사용은 거부한다. 합쳐진 본문도 일반 입력 검증·권한 검사를 그대로 거친다.
- 임시 데이터는 소비/취소 후 삭제된다. 중단 건은 10분 이후 접근이 차단되며 다음 전송 시작 시 물리적으로 정리된다. 정기 삭제 스케줄러가 있는 것처럼 안내하지 않는다.
- 3MiB 이상 허용된 응답은 스트리밍한다. 원본 다운로드에도 소유자 권한을 먼저 확인한다. 실제 Vercel에서 5MiB 원본 업로드·다운로드와 SHA-256 일치를 확인했다.
- 로컬 PDF는 기존 Chromium, Vercel PDF는 `@sparticuz/chromium`을 사용한다. Noto Sans KR 글꼴을 PDF HTML에 내장해 운영체제 글꼴에 의존하지 않는다. 외부 네트워크 리소스 요청은 차단한다.
- 공개 화면은 가상 자료 체험용임을 알리고, 저장 위치와 로컬 계정/작업과의 차이를 안내한다.

## 검증 기록

| 항목 | 2026-10-06 결과 |
|---|---|
| TypeScript + Vite 빌드 | PASS |
| 코드/API 테스트 | 전체 42/42 PASS. 최종 PostgreSQL count 타입 수정 후 관련 5/5 재통과 |
| 기존 브라우저 시나리오 | 16/17 통과, 1개는 변경된 요청 접수 문구에 대한 기존 기대값 불일치. 기대값을 실제 문구로 수정 후 해당 시나리오 PASS |
| PostgreSQL SQL/타입/ACL | PGlite의 실제 PostgreSQL 엔진에서 마이그레이션·가입·원본·공유·해제·템플릿·낙관적 잠금·삭제·일반 역할 접근 거부 PASS |
| SQLite 동시 요청 | 트랜잭션 분리와 실패 롤백 PASS |
| 5MiB 원본 전송/다운로드 | 분할 전송·세션/경로 차단·크기 검증·재사용/만료 차단·스트리밍 후 SHA-256 일치 PASS |
| PDF 한글 | 10페이지 텍스트에서 한글 1,033자 추출. 표지 PNG 렌더링에서 한글·표·여백 확인. 이번 검사에서 모든 페이지 시각 전수 검사는 하지 않음 |
| 기존 로컬 저장 작업 | 4개 payload 해시 불변, SQLite quick_check=ok |
| Supabase 스키마·TLS | 전용 테이블 10개/RLS 확인. 공식 CA 기반 풀러 TLS 1.3 인증서·호스트 검증 및 실제 운영 DB 저장·조회 PASS |
| Vercel 빌드·배포·공개 URL | `963fb24` Ready, 공개 화면과 API PASS. 초기 ESM/패키지 파일 추적 오류는 아래 기록 참고 |
| Vercel Linux Chromium/PDF·큰 본문·공유 | 운영 API 검증 16항목 PASS. 5MiB 원본 SHA-256 일치, 권한 해제 후 조회·출력 403 |
| 운영 출력물 | Excel 주요 지표 일치, PPTX 네이티브 차트·내장 워크북 존재. PDF 10페이지·한글 1,033자 추출, 전체 축소 미리보기와 1·4페이지 확대 렌더링에서 잘림/겹침 없음 |
| 브라우저 실제 PPT 다운로드 | 공개 사이트의 150명·24개월 샘플에서 686,306바이트 파일 생성. 25슬라이드·네이티브 차트 14개·편집용 워크북 14개 및 표지 HRBIP 확인 |

## 실제 URL 검증과 남은 범위

- [x] 첫 화면·정적 자산·샘플·규칙 보고서와 추천 차트
- [x] 회원가입·비밀번호 로그인·Secure/HttpOnly/SameSite 쿠키·로그아웃 후 세션 무효화
- [x] 사용자 제공 가상 XLSX 6시트 업로드, 통합 항목 연결, 2017년 입사일 보존, 2020~2026 선택 시 부족한 기간 안내
- [x] 실제 PostgreSQL 저장·재조회, 템플릿 저장·조회. 별도 서버 강제 종료 후 복원 시험은 하지 않음
- [x] 회사 PPTX/Excel 양식 분석·연결 저장·출력·다른 사용자 접근 차단
- [x] PDF 한글/페이지, 편집 가능한 PPTX 구조, 집계 Excel
- [x] 4.5MB를 넘는 요청과 응답, 원본 보관과 소유자만 다운로드
- [x] 지정 계정 조회·필터 탐색, 제3자/비로그인 차단·해제 후 조회/출력 차단
- [x] 실제 공개 URL·Git 연결·배포 커밋 기록
- [ ] Microsoft PowerPoint/Excel 데스크톱 앱에서 직접 편집 검수 (파일 구조와 계산값은 검사함)
- [ ] 장기간 사용·동시 접속 부하·무료 서비스 휴면 후 복귀·DB 복구 시험

API 검증은 가상 테스트 계정 3개로 실행했다. 테스트 작업·템플릿·회사 양식 삭제와 로그아웃을 요청했으며, 테스트 계정 레코드 3개는 남아 있다. 기존 사용자 자료는 변경하지 않았다. 산출물과 화면 기록은 Git 제외 경로 `artifacts/deployment/`에 보관했다.

## 배포 오류와 재발 방지

- 최초 배포는 Ready였지만 확장자 없는 상대 import 때문에 실제 API가 실패했다. 서버·공유 모듈에 `.js` 경로를 명시했다.
- PptxGenJS 4.0.1의 ESM 형식 감지 차이는 공식 CommonJS export를 사용하는 어댑터로 처리했다. 파일 추적 누락 방지를 위해 해당 패키지의 런타임 파일을 명시적으로 포함했다.
- `npm run check:runtime`은 컴파일된 진입점을 Node 자동 모듈 감지 없이 실행해 확인한다. 실제 배포 검증과 함께 사용하며, 이 검사만으로 Vercel 파일 포함 상태까지 통과했다고 판단하지 않는다.
- 이후 변경: 필요한 테스트와 빌드 → 변경 커밋 → 현재 앱 HEAD만 `main`에 push → Vercel Ready와 공개 URL 확인. 비밀값은 Vercel의 운영 환경 설정에서 관리한다.

## 운영 범위와 추가 검토

포트폴리오용 가상 자료 체험 배포를 준비한 것이다. 실제 HR 자료 운영을 위한 보안 검토, 다중 서버 공통 속도 제한, 계정 복구/이메일 확인, 저장 용량별 쿼터, 정기 임시 자료 삭제, 백업 복구·감사 정책은 검증되지 않았다. 무료 서비스의 용량·휴면·사용 한도로 인한 중단 가능성도 운영 전에 확인한다. 무중단이나 무료 영구 운영을 보장하지 않는다.

## 공식 문서

- [Vercel Node 함수](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel 본문 크기와 스트리밍](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)
- [Vercel 설정 파일](https://vercel.com/docs/project-configuration/vercel-json)
- [Supabase PostgreSQL 연결](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [서버용 Chromium](https://github.com/Sparticuz/chromium)
