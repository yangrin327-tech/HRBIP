import { test, expect } from "@playwright/test";

test("wide monthly cost file can be reshaped in the UI without editing its original", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "내 자료로 시작하기" }).click();
  await page.getByLabel("파일 업로드").setInputFiles({
    name: "wide.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "사번,기준월,기본급,식대,총액\nA,2026-09-01,3000000,200000,3200000",
    ),
  });
  await page.getByLabel("표 구조").selectOption("columns");
  await page.getByLabel("분석 영역").selectOption("payroll");
  await page.getByLabel("사번 열", { exact: true }).selectOption("사번");
  await page.getByLabel("기준일·귀속월 열").selectOption("기준월");
  await page.getByRole("checkbox", { name: "기본급", exact: true }).check();
  await page.getByRole("checkbox", { name: "식대", exact: true }).check();
  await page.getByRole("button", { name: "항목 연결·데이터 확인" }).click();
  for (let i = 0; i < 2; i++) {
    await page.locator(".dataset-tabs button").nth(i).click();
    await page
      .getByLabel("연결된 항목, 한 행의 의미, 단위와 자료 범위를 확인했어요.")
      .check();
  }
  await page
    .getByLabel("위 기간·포함 대상·집계 기준으로 보고서를 만드는 데 동의해요.")
    .check();
  await page.getByRole("button", { name: "추천 결과 만들기" }).click();
  await expect(
    page.locator(".metric").filter({ hasText: "제공 지급액 합계" }),
  ).toContainText("3,200,000");
});
test("saved share login, restricted access, viewer filtering and permission revocation in browser", async ({
  page,
  browser,
}) => {
  const suffix = Date.now(),
    owner = await browser.newContext(),
    viewer = await browser.newContext(),
    stranger = await browser.newContext();
  const reg = async (ctx: any, name: string) => {
    const response = await ctx.request.post(
      "http://127.0.0.1:4180/api/auth/register",
      {
        data: {
          username: name + suffix,
          password: "synthetic-only-password-123456",
        },
      },
    );
    expect(response.status()).toBe(201);
    return (await response.json()).user;
  };
  try {
    const a = await reg(owner, "shareowner"),
      b = await reg(viewer, "shareviewer");
    await reg(stranger, "shareother");
    const p = await owner.newPage();
    await p.goto("/");
    await p
      .getByRole("button", { name: "샘플로 체험하기", exact: true })
      .click();
    await p.getByRole("button", { name: "최종 확인·내보내기" }).click();
    await p
      .getByLabel(
        "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
      )
      .check();
    await p.getByRole("button", { name: "닫기", exact: true }).click();
    await p.getByRole("button", { name: "공유", exact: true }).click();
    await p.getByLabel("상대방 계정 ID").fill(b.id);
    await p.getByRole("button", { name: "조회 권한 추가" }).click();
    await expect(p.locator(".share-list")).toContainText("shareviewer");
    const link = await p.getByLabel("웹 공유 링크").inputValue();
    const v = await viewer.newPage();
    await v.goto(link);
    await expect(
      v.getByRole("heading", { name: "2026년 3분기 인사현황" }),
    ).toBeVisible();
    await expect(
      v.getByRole("button", { name: "구성 편집", exact: true }),
    ).toHaveCount(0);
    await v.getByLabel("부서", { exact: true }).selectOption("경영지원");
    await expect(v.locator(".primary-metric")).toContainText("9");
    const s = await stranger.newPage();
    await s.goto(link);
    await expect(s.getByRole("alert")).toContainText("권한이 없습니다");
    await page.goto(link);
    await expect(page.getByRole("dialog")).toBeVisible();
    await p.getByRole("button", { name: "권한 해제", exact: true }).click();
    await v.reload();
    await expect(v.getByRole("alert")).toContainText("권한이 없습니다");
  } finally {
    await owner.close();
    await viewer.close();
    await stranger.close();
  }
});
test("save failure and expired session preserve the edited report", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page
    .getByLabel("담당자 설명·의견")
    .fill("실패해도 남아 있어야 하는 문장");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "처음이신가요? 계정 만들기" }).click();
  await page.getByLabel("아이디", { exact: true }).fill("failure" + Date.now());
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("synthetic-password-123456");
  await page.getByRole("button", { name: "계정 만들고 시작" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.route("**/api/works", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "테스트 저장 실패. 다시 시도하세요." }),
    }),
  );
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("저장 실패");
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    "실패해도 남아 있어야 하는 문장",
  );
  await page.unroute("**/api/works");
  await page.route("**/api/works", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "로그인 만료" }),
    }),
  );
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).last().click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    "실패해도 남아 있어야 하는 문장",
  );
});

import { mkdir, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
test("guest sample, report editing, linked filters, chart editor and PDF download", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "기존 인사 자료에서, 대시보드와 보고서까지.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/verification/home-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2026년 3분기 인사현황", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".save-state")).toContainText(
    "아직 저장하지 않은 작업",
  );
  await expect(page.locator(".save-state")).toContainText(
    "파일 다운로드만으로는 작업 목록에 남지 않아요",
  );
  await page.screenshot({ path: "artifacts/verification/HRBIP-dashboard.png" });
  const departmentCard = page.locator(".chart-card").filter({
    has: page.getByRole("heading", {
      name: "기준월 말 부서별 인원",
      exact: true,
    }),
  });
  await departmentCard.locator(".recharts-bar-rectangle").first().click();
  await expect(page.getByLabel("부서", { exact: true })).toHaveValue(
    "제품개발",
  );
  await expect(page.locator(".primary-metric strong")).toContainText("9");
  await page.getByRole("button", { name: "전체 필터 초기화" }).click();
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  const notes = page.getByLabel("담당자 설명·의견");
  await notes.fill("직접 작성한 의견이 유지되어야 합니다.");
  await page.getByLabel("부서", { exact: true }).selectOption("경영지원");
  await expect(notes).toHaveValue("직접 작성한 의견이 유지되어야 합니다.");
  await expect(page.getByText("현재 조건으로 다시 계산한 초안")).toBeVisible();
  await page
    .getByRole("button", { name: "직접 수정했고 현재 기준과 맞아요" })
    .click();
  await page.getByRole("button", { name: "전체 필터 초기화" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "새 초안으로 갱신" }).click();
  await page.getByRole("tab", { name: "대시보드", exact: true }).click();
  await page.getByRole("button", { name: "구성 편집", exact: true }).click();
  await page.getByLabel("색상 테마").selectOption("forest");
  await page.getByLabel("기본 틀").selectOption("focus");
  await page.getByRole("button", { name: "편집 패널 닫기" }).click();
  await page.screenshot({
    path: "artifacts/verification/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "최종 확인·내보내기" }).click();
  await page
    .getByLabel(
      "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
    )
    .check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF 다운로드", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  expect(errors).toEqual([]);
});
test("CSV upload: mapping, invalid cell correction, criteria, result and XLSX export", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "내 자료로 시작하기" }).click();
  const csv =
    "사번,입사일,퇴사일,부서,고용형태\nA,2026-01-01,,인사,정규직\nB,2026-02-30,2026-09-30,인사,계약직";
  await page.getByLabel("파일 업로드").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("시트별로 직접 연결하기")).toBeVisible();
  await page.getByRole("button", { name: "항목 연결·데이터 확인" }).click();
  await page.getByLabel("이력 확인 시작일").fill("2026-01-01");
  await page.getByLabel("이력 확인 종료일").fill("2026-09-30");
  await page
    .getByLabel("연결된 항목, 한 행의 의미, 단위와 자료 범위를 확인했어요.")
    .check();
  await expect(
    page.getByText("입사일을 해석할 수 없습니다.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "3행 입사일 수정", exact: true })
    .click();
  await page.getByLabel("수정할 값").fill("2026-02-28");
  await page.getByRole("button", { name: "수정하고 재검증" }).click();
  await page
    .getByLabel("위 기간·포함 대상·집계 기준으로 보고서를 만드는 데 동의해요.")
    .check();
  await expect(
    page.getByRole("button", { name: "추천 결과 만들기" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "추천 결과 만들기" }).click();
  await expect(page.locator(".primary-metric strong")).toContainText("2");
  await page.getByRole("button", { name: "최종 확인·내보내기" }).click();
  await page
    .getByLabel(
      "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
    )
    .check();
  await page.getByLabel("파일 형식").selectOption("xlsx");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "XLSX 다운로드" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
});
test("XLSX multiple sheets and flexible headers", async ({ page }) => {
  const wb = new ExcelJS.Workbook(),
    a = wb.addWorksheet("현재명단"),
    b = wb.addWorksheet("지급");
  a.addRow(["설명", "이 행은 제목"]);
  a.addRow(["직원번호", "부서명"]);
  a.addRow(["A", "HR"]);
  b.addRow(["기록번호", "직원번호", "지급일", "지급항목", "지급액"]);
  b.addRow(["P1", "A", "2026-09-25", "기본급", 3000000]);
  await mkdir("artifacts/verification", { recursive: true });
  await wb.xlsx.writeFile("artifacts/verification/upload-fixture.xlsx");
  await page.goto("/");
  await page.getByRole("button", { name: "내 자료로 시작하기" }).click();
  await page
    .getByLabel("파일 업로드")
    .setInputFiles("artifacts/verification/upload-fixture.xlsx");
  await expect(page.locator(".sheet-choice")).toHaveCount(2);
  await page.getByLabel("헤더 행").first().selectOption("1");
  await page.getByRole("button", { name: "항목 연결·데이터 확인" }).click();
  await expect(page.locator(".dataset-tabs button")).toHaveCount(2);
  await page.getByLabel("명단의 범위").selectOption("current");
  await page.getByLabel("명단 기준일").fill("2026-09-30");
  await page
    .getByLabel("연결된 항목, 한 행의 의미, 단위와 자료 범위를 확인했어요.")
    .check();
  await page.locator(".dataset-tabs button").nth(1).click();
  await expect(page.getByLabel("이 자료의 역할")).toHaveValue("payroll");
  await page
    .getByLabel("연결된 항목, 한 행의 의미, 단위와 자료 범위를 확인했어요.")
    .check();
  await page
    .getByLabel("위 기간·포함 대상·집계 기준으로 보고서를 만드는 데 동의해요.")
    .check();
  await page.getByRole("button", { name: "추천 결과 만들기" }).click();
  await expect(
    page.getByText("3,000,000", { exact: false }).first(),
  ).toBeVisible();
});
test("real registration, save/reopen, template reuse without old data, feature request and phone layout", async ({
  page,
}) => {
  const username = "tester" + Date.now();
  await page.goto("/");
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "처음이신가요? 계정 만들기" }).click();
  await page.getByLabel("아이디", { exact: true }).fill(username);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("synthetic-test-password-12345");
  await page.getByRole("button", { name: "계정 만들고 시작" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page.getByLabel("담당자 설명·의견").fill("다시 열기 검증용 의견");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장했어요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "템플릿 저장", exact: true }).click();
  await page.getByLabel("템플릿 이름").fill("데이터 없는 템플릿");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "템플릿 저장", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "워크스페이스" })
    .getByRole("button", { name: "저장한 작업", exact: true })
    .click();
  await page.getByRole("button", { name: "열기", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("저장한 작업이에요");
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    "다시 열기 검증용 의견",
  );
  await page.getByLabel("담당자 설명·의견").fill("다시 열어 수정한 의견");
  await expect(page.locator(".save-state")).toContainText(
    "저장 후 변경사항이 있어요",
  );
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("저장한 작업이에요");
  await page
    .getByRole("navigation", { name: "워크스페이스" })
    .getByRole("button", { name: "저장한 작업", exact: true })
    .click();
  await page.getByRole("button", { name: "새 데이터 적용" }).click();
  await expect(
    page.getByRole("heading", { name: "어떤 자료로 시작할까요?" }),
  ).toBeVisible();
  await expect(page.getByText("현재 작업에 연결한 표")).toHaveCount(0);
  await page
    .getByRole("button", { name: "기능 제안하기", exact: true })
    .click();
  await page
    .getByLabel("원하는 기능", { exact: true })
    .fill("테스트: 휴가 사용 추이를 비교하고 싶어요.");
  await page.getByRole("button", { name: "기능 요청 저장" }).click();
  await expect(
    page.getByText(/HRBIP의 기능 요청함에 저장했습니다/),
  ).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "HRBIP 홈" }).click();
  await page.screenshot({
    path: "artifacts/verification/home-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/verification/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("workspace navigation stays available on mobile and login returns to saved work", async ({
  page,
}) => {
  const username = "history" + Date.now();
  const password = "synthetic-history-password-12345";
  const registered = await page.request.post("/api/auth/register", {
    data: { username, password },
  });
  expect(registered.status()).toBe(201);
  await page.request.post("/api/auth/logout", { data: {} });
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button")).toHaveCount(2);
  await expect(header.getByRole("navigation")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "새 보고서", exact: true }),
  ).toHaveCount(0);
  const workspace = page.getByRole("navigation", { name: "워크스페이스" });
  await expect(workspace.getByRole("button")).toHaveCount(3);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const button of await workspace.getByRole("button").all()) {
    await expect(button).toBeInViewport();
  }
  await workspace
    .getByRole("button", { name: "저장한 작업", exact: true })
    .click();
  await page.getByLabel("아이디", { exact: true }).fill(username);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "로그인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "저장한 작업·공유받은 보고서",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
