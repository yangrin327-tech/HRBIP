import { createRequire } from "node:module";
import type PptxGenJS from "pptxgenjs";

// 4.x publishes its ESM entry as .js without type:module. Vercel's loader
// cannot infer that format; use the package's explicit CommonJS export.
const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs") as typeof PptxGenJS;
export default pptxgen;
