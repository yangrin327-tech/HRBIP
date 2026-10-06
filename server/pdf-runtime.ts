import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

let cachedCss: string | undefined;
export function pdfFontCss() {
  if (cachedCss) return cachedCss;
  const require = createRequire(import.meta.url);
  const cssPath = require.resolve("@fontsource/noto-sans-kr/400.css");
  cachedCss = readFileSync(cssPath, "utf8").replace(
    /src:\s*url\(([^)]+\.woff2)\)[^;]+;/g,
    (_match, file: string) =>
      `src:url(data:font/woff2;base64,${readFileSync(resolve(dirname(cssPath), file)).toString("base64")}) format('woff2');`,
  );
  return cachedCss;
}

export async function launchPdfBrowser() {
  if (process.env.VERCEL) {
    const { default: serverless } = await import("@sparticuz/chromium");
    return chromium.launch({
      args: serverless.args,
      executablePath: await serverless.executablePath(),
      headless: true,
    });
  }
  return chromium.launch({ headless: true });
}
