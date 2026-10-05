# HRBIP PRD 인포그래픽 제작 기록

- 제작 당시 기준: PRD v0.1. [현재 PRD](../PRD.md)는 질문 1~17을 통합한 v0.3으로 갱신되었다.
- 현재와 다른 부분: 사용자가 기간 기준을 해제했고, 종합 인사 보고서·다양한 출력·인터랙티브 대시보드 등으로 기획을 구체화했다. 이미지의 3일 문구, 인원 중심 범위와 네이비·블루 색상은 과거 기록이며 현재 웹 제작 기준은 아니다. 현재 웹 색상은 흰색·초록·연두다.
- 작성일: 2026-10-05
- 용도: 제작 당시 v0.1 기획을 한눈에 검토하는 한국어 인포그래픽. 실제 구현 화면이나 완료된 기능을 의미하지 않는다.
- 제작 도구: 내장 image_gen 도구. 별도 CLI나 사용자 API 키는 사용하지 않았다.
- 요약 원칙: 대상과 문제, 제품 구조, 핵심 사용자 흐름, 1차 제안 범위, 추천 이유와 선택 편집, 완료 기준, 미정 사항, 확장 방향을 한 장에 배치한다.
- 차트는 표현 방식의 예시이며 실제 인사 데이터 분석 결과가 아니다.
- 원본 PRD의 상세 집계 정의와 예외 조건은 이미지에서 축약했다. 구현 시에는 PRD를 확인한다.
- 최종 이미지: [HRBIP_PRD_overview_v0.1.png](images/HRBIP_PRD_overview_v0.1.png)
- 파일 형식·크기: PNG, 1448 × 1086px.
- 검수: 생성 결과에서 한글 문구, 주요 내용, 잘림·겹침, 상태 표시를 확인했다. 최초 이미지의 대상 사용자 카드 상태를 ‘제안’으로 수정하고 나머지 문구·구성이 유지되는지 육안 비교했다.
- 저장 확인: 생성 원본과 프로젝트에 복사한 파일의 SHA-256 값이 일치함을 확인했다. 원본 파일은 보존했다.

## 최초 생성 프롬프트

```text
Use case: infographic-diagram.
Create ONE polished, highly readable Korean infographic summarizing a product requirements document for the user to review at a glance. This is a planning overview, NOT a screenshot of an implemented product. Landscape 4:3 composition, high resolution, generous margins, refined editorial information design, white/light warm-gray background, dark navy type, blue and teal accents, restrained amber for undecided items. Use large crisp Korean sans-serif lettering. No people, robots, photos, 3D objects, stock illustrations, watermarks or decorative filler. Use small clean line icons and actual diagrammatic hierarchy. All content below must be spelled correctly. Do not add features or marketing claims. Use the labels "확정 방향", "제안", "미정" to distinguish status; no green checkmarks that imply implemented features. The product has not been implemented.

Hierarchy and exact Korean/English copy:

HEADER:
Very large brand "HRBIP"
Under brand "HR Business Intelligence Partner"
Title "PRD 한눈에 보기"
Small status label "v0.1 기획 초안 · 2026.10.05"
Prominent one-sentence purpose:
"데이터를 넣으면 추천 대시보드와 보고서 초안을 만들고,"
"이유를 이해한 뒤 필요한 부분을 바꾸는 HR 업무 지원 웹"

TOP: three concise cards, left to right:
1) "누구를 위해?"
"정기 보고를 만드는 HR·인사총무 담당자"
"BI 도구에 익숙하지 않아도 사용"
2) "해결할 문제 · 가설"
"매달 반복되는 자료 정리·차트·보고 문장 작성"
"실제 업무의 불편과 필요성은 검증 예정"
3) "제품 구조 · 확정 방향"
"전체: 확장 가능한 HR 업무 지원 웹"
"첫 도구: 인사현황 보고서 + 대시보드"

CENTER: a visually prominent horizontal sequence of five connected, numbered steps. Use unambiguous left-to-right arrows, no branches crossing:
"01 데이터 입력" / small "샘플 또는 정해진 양식"
"02 검증·집계" / small "오류·기간·집계 기준 확인"
"03 추천 + 이유" / small "대시보드와 구성 이유 제시"
"04 선택 편집" / small "차트·색·배치·문구 변경"
"05 결과물 완성" / small "보고서·대시보드 내보내기"

BELOW: two large adjacent panels with a clear hierarchy.
Left panel title "1차 제작 범위 · 제안"
Four simple KPI tiles labelled "재직 인원", "입사", "퇴사", "순증". Do NOT invent data or numeric KPI values.
Below, three miniature diagrammatic chart icons with their labels, not real analytics or made-up quantitative data:
"월별 인원 → 선그래프"
"부서별 인원 → 가로 막대"
"입사·퇴사 → 묶은 막대"
Last line "검증된 수치로 보고 문장 초안 생성 → 담당자 수정"

Right panel title "핵심 경험 · 확정 방향"
Big short emphasis "먼저 추천하고, 원하면 수정"
A subtle speech-bubble example labelled "대시보드 아래의 짧은 설명"
Exact example: "시간에 따른 변화를 보기 쉽게 선그래프로 구성했어요."
Then compact controls as illustrations, with labels:
"그래프 변경"  "색상 변경"  "기본 틀 변경"
And a sentence "맞지 않는 차트에는 이유와 대안 안내"
Small label/button "추천 구성으로 되돌리기"
Do not draw a pie chart as an alternative for a time series. Do not imply every chart is interchangeable.

BOTTOM: three compact equal-width cards:
Card A title "완료 판단 기준"
"보고서·차트·지표의 수치 일치"
"추천 이유와 실제 화면 일치"
"데이터가 없으면 부족한 정보 안내"
Card B title "아직 정할 것 · 미정"
"데이터 양식·집계 기준·기술 스택"
"AI 연결 방식·저장 방식"
"내보내기 형식: PDF 우선 제안"
Card C title "이후 확장 방향"
"반복해서 필요한 HR 도구 추가"
"사용자 피드백으로 우선순위 결정"
"Tableau 연결은 초기 필수 아님"

FOOTER:
"미니 프로젝트 약 3일 · 10/6 상담 후 조정"
"실무 수요·효과는 검증 전 · 현재 구현 전 단계"

Constraints: Typography must remain readable at full image viewing size; enough line height and padding; no overlapped Korean syllables, no text cropped at edges, no microscopic body text. Prioritize exact Korean text over ornamental graphics. All section labels and short descriptions above should fit with clear hierarchy. Do not invent precise savings, user counts, implementation claims, stack names, or selected API vendors. This is a faithful v0.1 PRD overview; status distinctions are essential.
```

## 수정 프롬프트

대상 사용자 카드의 상태를 PRD에 맞춰 ‘확정 방향’에서 ‘제안’으로 수정한다.

```text
undefined
```

