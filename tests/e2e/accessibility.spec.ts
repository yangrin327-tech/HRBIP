import { openBasicSample } from "../navigation";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
test("home and dashboard accessibility audit", async ({ page }) => {
  await page.goto("/");
  const home = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await openBasicSample(page);
  const dashboard = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await writeFile(
    "artifacts/verification/accessibility.json",
    JSON.stringify(
      { home: home.violations, dashboard: dashboard.violations },
      null,
      2,
    ),
  );
  expect(
    home.violations.map((v) => ({
      id: v.id,
      examples: v.nodes.slice(0, 2).map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    dashboard.violations.map((v) => ({
      id: v.id,
      examples: v.nodes.slice(0, 2).map((n) => n.target),
    })),
  ).toEqual([]);
});
