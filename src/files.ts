import Papa from "papaparse";
import { newDataset, type Dataset } from "../shared/model";
import { recommendMapping } from "../shared/import";
export type RawSheet = {
  id: string;
  fileId: string;
  fileBytes?: number;
  name: string;
  matrix: string[][];
  headerRow: number;
  selected: boolean;
  shape?: "records" | "columns";
  idColumn?: string;
  dateColumn?: string;
  wideRole?: "attendance" | "payroll";
  valueColumns?: string[];
};
export type Original = { id: string; name: string; data: string };
const LIMIT = 10 * 1024 * 1024;
function inspectZip(buffer: ArrayBuffer) {
  const v = new DataView(buffer);
  let total = 0,
    entries = 0;
  for (let i = 0; i + 46 < v.byteLength; i++)
    if (v.getUint32(i, true) === 0x02014b50) {
      const size = v.getUint32(i + 24, true),
        len = v.getUint16(i + 28, true),
        extra = v.getUint16(i + 30, true),
        comment = v.getUint16(i + 32, true);
      total += size;
      entries++;
      if (total > 60 * 1024 * 1024 || entries > 2000 || size === 0xffffffff)
        throw new Error(
          "압축 해제 크기가 60MB를 넘거나 지원하지 않는 XLSX 구조입니다.",
        );
      i += 45 + len + extra + comment;
    }
  if (!entries) throw new Error("올바른 XLSX 압축 구조가 아닙니다.");
}
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o) {
      if (o.result === undefined)
        throw new Error(
          "계산 결과가 없는 수식이 있습니다. Excel에서 계산·저장 후 다시 올려 주세요.",
        );
      return cellText(o.result);
    }
    if ("richText" in o)
      return (o.richText as { text: string }[]).map((p) => p.text).join("");
    if ("text" in o) return String(o.text);
    if ("error" in o) return String(o.error);
  }
  return String(v);
}
export async function parseFile(
  file: File,
  encoding: "utf-8" | "euc-kr",
): Promise<{ sheets: RawSheet[]; original: Original }> {
  if (file.size > LIMIT)
    throw new Error(file.name + ": 파일당 10MB까지 지원합니다.");
  if (!/\.(csv|xlsx)$/i.test(file.name))
    throw new Error(
      "CSV 또는 XLSX 파일을 선택하세요. XLS·XLSM·암호 파일은 지원하지 않습니다.",
    );
  const buffer = await file.arrayBuffer(),
    id = crypto.randomUUID();
  let matrices: { name: string; matrix: string[][] }[] = [];
  if (/\.csv$/i.test(file.name)) {
    const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    if (parsed.errors.some((e) => e.type === "Quotes"))
      throw new Error("CSV 따옴표 구조가 올바르지 않습니다.");
    matrices = [{ name: file.name, matrix: parsed.data }];
  } else {
    inspectZip(buffer);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const { compatibleXlsx } = await import("./xlsx-compat");
    try {
      await wb.xlsx.load(await compatibleXlsx(buffer));
    } catch {
      throw new Error(
        file.name +
          ": Excel 문서를 읽지 못했어요. 암호가 없는 XLSX인지 확인하고, Excel에서 새 XLSX로 저장한 뒤 다시 올려 주세요. CSV로 저장해서 올릴 수도 있어요.",
      );
    }
    if (!wb.worksheets.length)
      throw new Error(file.name + ": 읽을 수 있는 시트가 없습니다.");
    matrices = wb.worksheets.map((s) => {
      if (s.rowCount > 10050 || s.columnCount > 100)
        throw new Error("시트당 10,000개 데이터행·100열까지 지원합니다.");
      const matrix: string[][] = [];
      s.eachRow({ includeEmpty: true }, (row) => {
        const vals: string[] = [];
        for (let c = 1; c <= s.columnCount; c++)
          vals.push(cellText(row.getCell(c).value));
        matrix.push(vals);
      });
      return { name: file.name + " / " + s.name, matrix };
    });
  }
  if (
    matrices.some(
      (s) => s.matrix.length > 10050 || s.matrix.some((r) => r.length > 100),
    )
  )
    throw new Error(
      "표 크기 제한을 초과했습니다. 시트당 10,000행·100열까지 지원합니다.",
    );
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return {
    sheets: matrices
      .filter((s) => s.matrix.some((r) => r.some(Boolean)))
      .map((s, i) => ({
        id: id + "-" + i,
        fileId: id,
        fileBytes: file.size,
        ...s,
        headerRow: 0,
        selected: true,
      })),
    original: { id, name: file.name, data: btoa(binary) },
  };
}
export function sheetToDataset(s: RawSheet): Dataset {
  const headers = s.matrix[s.headerRow]?.map((v) => v.trim()) || [];
  if (!headers.length || headers.some((h) => !h))
    throw new Error(
      s.name +
        ": 헤더에 빈 열 이름이 있습니다. 파일에서 사용하지 않는 열을 정리하거나 헤더 행을 변경하세요.",
    );
  if (new Set(headers).size !== headers.length)
    throw new Error(
      s.name +
        ": 같은 이름의 열이 여러 개 있습니다. 구분 가능한 열 이름을 사용하세요.",
    );
  const raw = s.matrix.slice(s.headerRow + 1);
  if (raw.length > 10000)
    throw new Error("시트당 데이터 10,000행까지 지원합니다.");
  const rows = raw.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])),
  );
  const d = newDataset(s.name, headers, rows, s.id);
  d.mapping = recommendMapping(headers);
  if (!d.mapping.startDate && d.mapping.value) {
    d.role = headers.some((h) => /금액|급여|지급|amount/i.test(h))
      ? "payroll"
      : "attendance";
    d.unit = d.role === "payroll" ? "won" : "hours";
  }
  return d;
}

/** Explicitly selected numeric columns become separate typed tables; originals are untouched. */
export function sheetToDatasets(s: RawSheet): Dataset[] {
  if (s.shape !== "columns") return [sheetToDataset(s)];
  const base = sheetToDataset(s),
    chosen = s.valueColumns || [];
  if (!s.idColumn || !s.dateColumn || !chosen.length)
    throw new Error(s.name + ": 사번·기준일과 분석할 수치 열을 선택하세요.");
  if (chosen.some((c) => c === s.idColumn || c === s.dateColumn))
    throw new Error("사번이나 날짜 열은 수치 열로 선택할 수 없습니다.");
  const suggested = recommendMapping(base.headers),
    role = s.wideRole || "attendance";
  return chosen.map((column) => {
    const rows = base.rows.map((r) =>
      Object.fromEntries([
        ["사번", r[s.idColumn!] || ""],
        ["기준일", r[s.dateColumn!] || ""],
        ["항목", column],
        ["값", r[column] || ""],
        [
          "기록 ID",
          [r[s.idColumn!] || "", r[s.dateColumn!] || "", column].join("|"),
        ],
        ...(suggested.department
          ? [["부서", r[suggested.department] || ""]]
          : []),
        ...(suggested.employmentType
          ? [["고용형태", r[suggested.employmentType] || ""]]
          : []),
      ]),
    );
    const d = newDataset(
      s.name + " · " + column,
      Object.keys(rows[0] || {}),
      rows,
      s.id + "-" + column,
    );
    d.role = role;
    d.unit =
      role === "payroll" ? "won" : /일|days/i.test(column) ? "days" : "hours";
    d.mapping = recommendMapping(d.headers);
    if (role === "attendance") {
      if (/연장/.test(column)) d.categoryMap[column] = "overtime";
      else if (/사용|휴가|병가/.test(column)) d.categoryMap[column] = "leave";
      else if (/근무.*시간|근로.*시간/.test(column))
        d.categoryMap[column] = "work";
    }
    return d;
  });
}
