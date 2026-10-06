import { test, expect } from "@playwright/test";

test("report edits and filters survive reload, a new tab, and switching saved works", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await page.getByLabel("시작 월", { exact: true }).fill("2026-08");
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page
    .getByLabel("담당자 설명·의견")
    .fill("직접 작성한 문장: 다음 달 확인 필요.");
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
  await page.reload();
  await expect(page.getByLabel("시작 월", { exact: true })).toHaveValue(
    "2026-08",
  );
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    "직접 작성한 문장: 다음 달 확인 필요.",
  );
  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(second.getByLabel("담당자 설명·의견")).toHaveValue(
    "직접 작성한 문장: 다음 달 확인 필요.",
  );
  await second.close();
  // A freshly opened tab updates its revision; reopen to use the latest version.
  await page.reload();
  await page.getByRole("button", { name: "저장한 작업", exact: true }).click();
  await expect(page.locator(".saved-list article")).toHaveCount(1);
  await page.getByRole("button", { name: "새 작업", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "어떤 자료로 시작할까요?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "저장한 작업", exact: true }).click();
  await expect(page.locator(".saved-list article")).toHaveCount(2);
  await page
    .locator(".saved-list article")
    .filter({ hasText: "2026년 3분기 인사현황" })
    .getByRole("button", { name: "열기", exact: false })
    .click();
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    "직접 작성한 문장: 다음 달 확인 필요.",
  );
});

test("uploaded sheets and selections survive reload before mapping; templates contain no data", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "보고서 만들기", exact: true })
    .click();
  await page.getByLabel("파일 업로드").setInputFiles({
    name: "private.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("사번,입사일,퇴사일\nA,2017-01-01,\n"),
  });
  await expect(
    page.getByText("private.csv", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "저장한 작업", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("private.csv", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "모든 도구", exact: true }).click();
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await page.getByRole("button", { name: "템플릿 저장", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "구성을 템플릿으로 저장" });
  await modal.getByLabel("템플릿 이름").fill("월간 보고 구성");
  await modal.getByRole("button", { name: "템플릿 저장", exact: true }).click();
  await page.getByRole("button", { name: "저장한 작업", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "월간 보고 구성" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "새 데이터 적용" }).click();
  await expect(
    page.getByRole("heading", { name: "어떤 자료로 시작할까요?" }),
  ).toBeVisible();
  await expect(page.getByText("private.csv", { exact: false })).toHaveCount(0);
});

test("storage failure is visible and never labelled saved", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      value: {
        open() {
          throw new DOMException("저장 공간 부족", "QuotaExceededError");
        },
      },
    });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await expect(page.locator(".save-state")).toContainText(
    "자동 저장에 실패했어요",
  );
  await expect(page.getByRole("alert")).toContainText("브라우저 저장에 실패");
  await expect(page.locator(".save-state")).not.toContainText(
    "자동 저장했어요",
  );
});

test("another tab cannot silently overwrite edits; a separate copy can be saved", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator(".save-state")).toContainText("자동 저장했어요");
  await second.getByRole("tab", { name: "보고서", exact: true }).click();
  await second.getByLabel("담당자 설명·의견").fill("두 번째 탭의 의견");
  await expect(second.locator(".save-state")).toContainText("자동 저장했어요");
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page.getByLabel("담당자 설명·의견").fill("첫 번째 탭의 의견");
  await expect(page.getByRole("alert")).toContainText(
    "다른 탭에서 이 작업을 변경",
  );
  await page.getByRole("button", { name: "사본 저장", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
  await page.getByRole("button", { name: "저장한 작업", exact: true }).click();
  await expect(page.locator(".saved-list article")).toHaveCount(2);
});

test("deleting an active saved work does not resurrect it after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
  await page.getByRole("button", { name: "저장한 작업", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "2026년 3분기 인사현황 삭제", exact: true })
    .click();
  await expect(page.locator(".saved-list article")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "저장한 작업", exact: true }).click();
  await expect(page.locator(".saved-list article")).toHaveCount(0);
});
