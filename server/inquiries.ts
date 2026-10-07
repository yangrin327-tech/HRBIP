import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type InquiryRecord = { id: string; message: string; created: string };
export function fileInquiryWriter(
  directory = resolve(process.env.DATA_DIR || ".data", "inquiries"),
) {
  const folder = resolve(directory);
  return async (record: InquiryRecord) => {
    // Filename is a server-generated UUID, never visitor-controlled input.
    if (!/^[a-f0-9-]{36}$/.test(record.id))
      throw new Error("Invalid inquiry ID.");
    await mkdir(folder, { recursive: true });
    const date = new Date(record.created).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour12: false,
    });
    const text = `HRBIP 문의·기능 제안\n기록 번호: ${record.id}\n작성 시각: ${date} (한국 시간)\n\n${record.message}\n`;
    await writeFile(resolve(folder, record.id + ".txt"), text, {
      encoding: "utf8",
      flag: "wx",
    });
  };
}
