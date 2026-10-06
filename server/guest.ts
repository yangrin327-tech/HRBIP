import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "./database.js";
import { bindingSchema, type CompanyFormat } from "../shared/company-format.js";
import { sanitizeCompanyFormat } from "./company-format.js";

// Guest servers never open SQLite or a PostgreSQL pool. Fail closed if a new route
// accidentally attempts persistence instead of silently retaining visitor data.
export const noStorage: Store = {
  prepare() {
    throw new Error("Storage is disabled in guest mode.");
  },
  transaction() {
    throw new Error("Storage is disabled in guest mode.");
  },
  async close() {},
};

const guestFormatSchema = z.object({
  name: z.string().min(1).max(200),
  data: z.string().max(14000000),
  title: z.string().trim().min(1).max(160),
  bindings: z.array(bindingSchema).max(700),
  confirmed: z.literal(true),
  brand: z.object({
    font: z.string().min(1).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
});

export async function prepareGuestFormat(input: unknown) {
  const body = guestFormatSchema.parse(input);
  // Reinspect and sanitize on EVERY export; client-provided metadata is untrusted.
  const cleaned = await sanitizeCompanyFormat(
    Buffer.from(body.data, "base64"),
    body.bindings,
  );
  const meta: CompanyFormat = {
    id: randomUUID(),
    title: body.title,
    format: cleaned.inspection.format,
    version: 1,
    created: new Date().toISOString(),
    inspection: {
      ...cleaned.inspection,
      slots: cleaned.inspection.slots.map((s) => ({
        ...s,
        sample:
          body.bindings.find((b) => b.slot === s.id)?.field === "keep"
            ? s.sample
            : "",
        suggestion: body.bindings.find((b) => b.slot === s.id)?.field || "",
      })),
    },
    bindings: body.bindings,
    brand: body.brand,
  };
  return {
    meta,
    data: cleaned.data,
    // Keep the source only in the caller's tab. Sanitized XLSX has empty cells,
    // so a future inspection would no longer discover its original binding slots.
    // Every output request sanitizes this source again before using it.
    input: body,
  };
}
