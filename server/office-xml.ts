import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { posix } from "node:path";
export class FormatError extends Error {
  status = 422;
}
export const xml = (s: string): any => {
  if (/<!DOCTYPE|<!ENTITY/i.test(s))
    throw new FormatError("외부 엔터티가 있는 양식은 지원하지 않습니다.");
  return new DOMParser({
    onError: (level, message) => {
      if (level !== "warning")
        throw new FormatError(
          "양식 XML이 손상되었습니다: " + message.slice(0, 100),
        );
    },
  }).parseFromString(s, "application/xml");
};
export const serialize = (d: any) => new XMLSerializer().serializeToString(d);
export const all = (node: any, name: string): any[] =>
  Array.from(node.getElementsByTagName(name));
export const local = (node: any, name: string): any[] =>
  Array.from(node.getElementsByTagName("*")).filter(
    (n: any) => n.localName === name,
  );
export const remove = (n: any) => n.parentNode?.removeChild(n);
export const relPath = (path: string) =>
  posix.join(posix.dirname(path), "_rels", posix.basename(path) + ".rels");
export const targetPath = (source: string, target: string) =>
  target.startsWith("/")
    ? target.slice(1)
    : posix.normalize(posix.join(posix.dirname(source), target));
export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function readXml(zip: JSZip, path: string) {
  const f = zip.file(path);
  if (!f) throw new FormatError("양식의 필수 파일이 없습니다: " + path);
  return xml(await f.async("string"));
}
export async function safeOffice(data: Buffer) {
  if (data.length > 10 * 1024 * 1024)
    throw new FormatError("회사 양식은 10MB까지 등록할 수 있습니다.");
  // Read the central directory before decompression to reject zip bombs.
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
    if (data.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new FormatError("PPTX 또는 XLSX 파일을 선택하세요.");
  const count = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16),
    size = 0;
  if (count > 4000 || count === 65535)
    throw new FormatError(
      "양식 요소가 너무 많습니다. 필요한 페이지만 남겨주세요.",
    );
  for (let i = 0; i < count; i++) {
    if (offset + 46 > data.length || data.readUInt32LE(offset) !== 0x02014b50)
      throw new FormatError("손상된 압축 파일입니다.");
    const bytes = data.readUInt32LE(offset + 24);
    size += bytes;
    if (bytes > 16 * 1024 * 1024 || size > 60 * 1024 * 1024)
      throw new FormatError("압축 해제 후 양식 크기가 제한을 초과합니다.");
    offset +=
      46 +
      data.readUInt16LE(offset + 28) +
      data.readUInt16LE(offset + 30) +
      data.readUInt16LE(offset + 32);
  }
  const zip = await JSZip.loadAsync(data);
  for (const name of Object.keys(zip.files)) {
    if (
      /vbaProject|activeX|oleObject|externalLink|pivotCache|pivotTable|queryTable|connections\.xml|customXml|slicer|webextension/i.test(
        name,
      )
    )
      throw new FormatError(
        "매크로·외부 연결·피벗·OLE·사용자 XML이 포함된 양식입니다. 해당 요소를 제거한 복사본을 등록해 주세요.",
      );
    if (name.endsWith(".rels")) {
      const d = await readXml(zip, name);
      if (
        local(d, "Relationship").some(
          (r) => r.getAttribute("TargetMode") === "External",
        )
      )
        throw new FormatError(
          "외부 링크가 포함되어 있습니다. 링크를 제거한 양식 복사본을 등록하세요.",
        );
    }
  }
  return zip;
}
export async function prunePackage(zip: JSZip) {
  // Retain only reachable parts. Old chart workbooks, comments and notes cannot survive orphaned.
  for (const name of Object.keys(zip.files).filter((n) =>
    n.endsWith(".rels"),
  )) {
    const d = await readXml(zip, name),
      source =
        name === "_rels/.rels"
          ? ""
          : posix.join(
              posix.dirname(posix.dirname(name)),
              posix.basename(name).replace(/\.rels$/, ""),
            );
    const sourceDoc =
      source.endsWith(".xml") && zip.file(source)
        ? await readXml(zip, source)
        : null;
    for (const r of local(d, "Relationship")) {
      const type = r.getAttribute("Type"),
        id = r.getAttribute("Id");
      const nodes = sourceDoc
        ? (Array.from(sourceDoc.getElementsByTagName("*")) as any[])
        : [];
      const referenced = nodes.some((n) =>
        ["r:id", "r:embed", "r:link"].some((a) => n.getAttribute(a) === id),
      );
      if (
        /notesSlide|notesMaster|comment|person|custom-properties|thumbnail|calcChain|vmlDrawing/i.test(
          type,
        ) ||
        (/\/image$/.test(type) && sourceDoc && !referenced)
      ) {
        for (const n of nodes) if (n.getAttribute("r:id") === id) remove(n);
        remove(r);
      }
    }
    if (sourceDoc) zip.file(source, serialize(sourceDoc));
    zip.file(name, serialize(d));
  }
  const used = new Set<string>(["[Content_Types].xml", "_rels/.rels"]);
  async function visit(source: string, path: string) {
    if (!zip.file(path)) return;
    const doc = await readXml(zip, path);
    for (const r of local(doc, "Relationship")) {
      const t = targetPath(source, r.getAttribute("Target"));
      if (used.has(t)) continue;
      used.add(t);
      const rel = relPath(t);
      if (zip.file(rel)) {
        used.add(rel);
        await visit(t, rel);
      }
    }
  }
  await visit("", "_rels/.rels");
  for (const name of Object.keys(zip.files))
    if (!zip.files[name].dir && !used.has(name)) zip.remove(name);
  const ct = await readXml(zip, "[Content_Types].xml");
  for (const n of local(ct, "Override"))
    if (!zip.file(n.getAttribute("PartName").slice(1))) remove(n);
  zip.file("[Content_Types].xml", serialize(ct));
}
