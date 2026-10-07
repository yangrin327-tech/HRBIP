import { openBasicSample, openSavedWorks } from "../navigation";
import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";

test("editing during an account save keeps newer text marked as unsaved", async ({
  page,
}) => {
  await page.request.post("/api/auth/register", {
    data: {
      username: "race" + Date.now(),
      password: "synthetic-race-password-12345",
    },
  });
  await page.goto("/");
  await openBasicSample(page);
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  const notes = page.getByLabel("담당자 설명·의견");
  await notes.fill("저장 요청 시점의 문장");
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    sent = new Promise<void>((r) => (started = r));
  await page.route("**/api/works", async (route) => {
    if (route.request().method() === "POST") {
      started();
      await gate;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "계정에 저장", exact: true }).click();
  await sent;
  await notes.fill("저장 도중 새로 작성한 문장");
  release();
  await expect(page.locator(".save-state")).toContainText(
    "저장 후 변경사항이 있어요",
  );
  await expect(notes).toHaveValue("저장 도중 새로 작성한 문장");
  const list = await (await page.request.get("/api/works")).json();
  const saved = await (
    await page.request.get("/api/works/" + list[0].id)
  ).json();
  expect(saved.workspace.report.notes).toBe("저장 요청 시점의 문장");
  await page.unroute("**/api/works");
  await page.getByRole("button", { name: "계정에 저장", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("저장한 작업이에요");
  expect(
    (await (await page.request.get("/api/works/" + list[0].id)).json())
      .workspace.report.notes,
  ).toBe("저장 도중 새로 작성한 문장");
});

test("guest work and company format survive login; explicit saving restores them on another device", async ({
  page,
  browser,
}) => {
  const password = "synthetic-restore-password-12345",
    username = "restore" + Date.now();
  await page.goto("/");
  await openBasicSample(page);
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page.getByLabel("담당자 설명·의견").fill("로그인 전 작성한 의견");
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
  await page
    .getByRole("button", { name: "회사 양식 등록·적용", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "회사 양식 등록·적용" });
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("회사양식");
  sheet.getCell("B2").value = "{{title}}";
  sheet.getCell("B3").value = "{{metric:headcount}}";
  await modal.getByLabel("회사 양식 파일", { exact: true }).setInputFiles({
    name: "브라우저양식.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  });
  await modal
    .getByLabel(
      "연결과 고정 문구·그림을 확인했어요. 과거 수치나 개인정보가 남아 있지 않아요.",
    )
    .check();
  await modal
    .getByRole("button", { name: "연결 확인하고 이 보고서에 적용" })
    .click();
  await expect(modal.getByText(/브라우저양식 v1 적용됨/)).toBeVisible();
  await modal.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .getByRole("button", { name: "로그인하고 계정에 저장", exact: true })
    .click();
  await page.getByRole("button", { name: "처음이신가요? 계정 만들기" }).click();
  await page.getByLabel("아이디", { exact: true }).fill(username);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계정 만들고 시작" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    "로그인 전 작성한 의견",
  );
  expect(await (await page.request.get("/api/works")).json()).toEqual([]);
  expect(await (await page.request.get("/api/company-formats")).json()).toEqual(
    [],
  );
  // Download also must not silently persist the guest work or company file.
  await page.getByRole("button", { name: "최종 확인·내보내기" }).click();
  await page.getByLabel("파일 형식").selectOption("xlsx");
  await page
    .getByLabel(
      "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
    )
    .check();
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "XLSX 다운로드", exact: true })
    .click();
  const output = new ExcelJS.Workbook();
  await output.xlsx.load((await readFile((await (await dl).path())!)) as never);
  expect(output.getWorksheet("회사양식")!.getCell("B3").value).toBe(42);
  expect(await (await page.request.get("/api/works")).json()).toEqual([]);
  expect(await (await page.request.get("/api/company-formats")).json()).toEqual(
    [],
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.getByRole("button", { name: "계정에 저장", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("저장한 작업이에요");
  const saved = await (await page.request.get("/api/works")).json();
  expect(saved).toHaveLength(1);
  expect(
    await (await page.request.get("/api/company-formats")).json(),
  ).toHaveLength(1);
  const other = await browser.newContext();
  try {
    const r = await other.request.post("http://127.0.0.1:4180/api/auth/login", {
      data: { username, password },
    });
    expect(r.status()).toBe(200);
    const p = await other.newPage();
    await p.goto("/");
    await openSavedWorks(p);
    await p.getByRole("button", { name: "열기", exact: true }).click();
    await p.getByRole("tab", { name: "보고서", exact: true }).click();
    await expect(p.getByLabel("담당자 설명·의견")).toHaveValue(
      "로그인 전 작성한 의견",
    );
    await expect(
      p.getByRole("button", {
        name: "회사 양식 등록·적용 · 적용 중",
        exact: true,
      }),
    ).toBeVisible();
    await p.getByRole("button", { name: "계산 검증·검증표" }).click();
    await expect(
      p
        .getByRole("dialog")
        .getByText("계산 대조가 끝났어요.", { exact: false }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
  const outsider = await browser.newContext();
  try {
    expect(
      (
        await outsider.request.get(
          "http://127.0.0.1:4180/api/works/" + saved[0].id,
        )
      ).status(),
    ).toBe(401);
  } finally {
    await outsider.close();
  }
});
