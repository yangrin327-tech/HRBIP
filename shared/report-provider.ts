import { draft } from "./analytics";
import type { Result } from "./model";
export interface ReportProvider {
  readonly kind: "rules" | "external";
  generate(verified: Result): Promise<string>;
}
// No external AI requests. Implement an audited aggregate-only adapter here when authorized.
export const rulesProvider: ReportProvider = {
  kind: "rules",
  async generate(result) {
    return draft(result);
  },
};
