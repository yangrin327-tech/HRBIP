# HRBIP 외부 배포 준비

기준일: 2026-10-06. **코드 준비·로컬 검증 완료, 외부 배포 미완료.**

## 선택한 방식과 현재 막힌 지점

사용자가 이전 실습과 같은 배포 서비스를 요청했다. `day09` 실습 기록과 기존 계정의 `day09-saju` 프로젝트에서 **Vercel + Supabase**를 확인했다. Vercel Hobby 계정은 로그인되어 있고 HRBIP GitHub 저장소를 가져오는 화면까지 확인했다. Railway는 사용하지 않는다.

Supabase 로그인은 사용자가 완료했고 서울 지역에 무료 HRBIP 전용 프로젝트를 생성했다. 전용 테이블 10개와 RLS를 SQL Editor에서 적용한 결과를 확인했다. Vercel 비밀값 연결, 실제 배포와 URL 검증이 남았다. 기존 사주 프로젝트나 DB는 수정하지 않는다. 유료 플랜·결제는 승인받지 않았다.

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
- 3MiB 이상 허용된 응답은 스트리밍한다. 원본 다운로드에도 소유자 권한을 먼저 확인한다. 실제 Vercel에서 큰 업로드·응답 검증은 별도로 필요하다.
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
| Supabase 스키마·TLS | 전용 테이블 10개/RLS 확인. 공식 CA를 적용한 풀러 TLS 1.3 인증서·호스트 검증 PASS, 비밀번호는 전송하지 않음. 서버 계정 인증 연결은 아직 NOT TESTED |
| Vercel 빌드·배포·공개 URL | NOT TESTED |
| Vercel Linux Chromium/PDF·큰 본문·공유 | NOT TESTED |

## 실제 URL에서 남은 검증

- [ ] 첫 화면·정적 자산·샘플·규칙 보고서와 추천 차트
- [ ] 회원가입·로그인·HTTPS 세션 쿠키·로그아웃
- [ ] 업로드·항목 연결·저장·서버 재실행 후 다시 열기
- [ ] 회사 PPTX/Excel 양식 저장·재사용
- [ ] PDF 한글/페이지, 편집 가능한 PPTX, 집계 Excel
- [ ] 4.5MB를 넘는 요청과 응답, 원본 보관/삭제
- [ ] 지정 계정의 조회·탐색·출력, 제3자/비로그인 차단·권한 해제
- [ ] 실제 공개 URL·Git 연결·배포 커밋 기록

## 운영 범위와 추가 검토

포트폴리오용 가상 자료 체험 배포를 준비한 것이다. 실제 HR 자료 운영을 위한 보안 검토, 다중 서버 공통 속도 제한, 계정 복구/이메일 확인, 저장 용량별 쿼터, 정기 임시 자료 삭제, 백업 복구·감사 정책은 검증되지 않았다. 무료 서비스의 용량·휴면·사용 한도로 인한 중단 가능성도 운영 전에 확인한다. 무중단이나 무료 영구 운영을 보장하지 않는다.

## 공식 문서

- [Vercel Node 함수](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel 본문 크기와 스트리밍](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)
- [Vercel 설정 파일](https://vercel.com/docs/project-configuration/vercel-json)
- [Supabase PostgreSQL 연결](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [서버용 Chromium](https://github.com/Sparticuz/chromium)
