import JSZip from "jszip";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const PACKAGE_REL =
  "http://schemas.openxmlformats.org/package/2006/relationships";

/** ExcelJS expects unprefixed SpreadsheetML tags, although qualified tags are valid OOXML. */
function normalizeXml(xml: string, part: string): string {
  const source = new DOMParser().parseFromString(
    xml.replace(/^\uFEFF/, ""),
    "application/xml",
  );
  if (source.doctype || source.getElementsByTagName("parsererror").length)
    throw new Error("XLSX 내부 문서를 읽을 수 없습니다: " + part);
  let relationshipsChanged = false;
  let datesChanged = false;
  for (const cell of Array.from(source.getElementsByTagNameNS(MAIN, "c"))) {
    if (cell.getAttribute("t") !== "d") continue;
    // ExcelJS treats the ISO date cell type as a number (2026 -> a date in 1905).
    // HRBIP's input contract uses calendar dates, matching its serial-date day precision.
    const value = cell.getElementsByTagNameNS(MAIN, "v")[0];
    if (value && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value.textContent || "")) {
      cell.setAttribute("t", "str");
      value.textContent = value.textContent!.slice(0, 10);
      datesChanged = true;
    }
  }
  if (/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(part)) {
    for (const rel of Array.from(
      source.getElementsByTagNameNS(PACKAGE_REL, "Relationship"),
    )) {
      const path = rel.getAttribute("Target");
      // ExcelJS indexes worksheet table/drawing targets as paths relative to xl/worksheets/.
      if (
        rel.getAttribute("TargetMode") !== "External" &&
        path?.startsWith("/xl/")
      ) {
        rel.setAttribute("Target", "../" + path.slice(4));
        relationshipsChanged = true;
      }
    }
  }
  const elements = Array.from(source.getElementsByTagName("*"));
  if (
    !relationshipsChanged &&
    !datesChanged &&
    !elements.some(
      (el) =>
        ((el.namespaceURI === MAIN || el.namespaceURI === PACKAGE_REL) &&
          el.prefix) ||
        Array.from(el.attributes).some(
          (a) => a.namespaceURI === REL && a.prefix !== "r",
        ),
    )
  )
    return xml;

  const target = document.implementation.createDocument(null, "", null);
  function copy(node: Node): Node {
    if (node.nodeType !== Node.ELEMENT_NODE)
      return target.importNode(node, true);
    const element = node as Element;
    const result = target.createElementNS(
      element.namespaceURI,
      element.namespaceURI === MAIN || element.namespaceURI === PACKAGE_REL
        ? element.localName
        : element.tagName,
    );
    for (const attr of Array.from(element.attributes)) {
      // XMLSerializer supplies the correct default namespace on the new elements.
      if (
        attr.namespaceURI === XMLNS &&
        (attr.value === MAIN ||
          attr.value === REL ||
          attr.value === PACKAGE_REL)
      )
        continue;
      result.setAttributeNS(
        attr.namespaceURI,
        attr.namespaceURI === REL ? "r:" + attr.localName : attr.name,
        attr.value,
      );
    }
    for (const child of Array.from(element.childNodes))
      result.appendChild(copy(child));
    return result;
  }
  target.appendChild(copy(source.documentElement));
  return new XMLSerializer().serializeToString(target);
}

/** Only the in-memory reading copy changes; retained/downloadable originals remain byte-identical. */
export async function compatibleXlsx(
  buffer: ArrayBuffer,
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);
  const workbook = zip.file("xl/workbook.xml");
  if (!workbook)
    throw new Error(
      "XLSX의 통합문서 정보가 없습니다. Excel에서 XLSX로 다시 저장해 주세요.",
    );
  let changed = false;
  for (const file of zip.file(
    /^xl\/(?:(?:workbook|styles|sharedStrings|worksheets\/sheet\d+|tables\/table\d+|comments\d+)\.xml|worksheets\/_rels\/sheet\d+\.xml\.rels)$/,
  )) {
    const original = await file.async("string");
    const normalized = normalizeXml(original, file.name);
    if (normalized !== original) {
      zip.file(file.name, normalized);
      changed = true;
    }
  }
  return changed
    ? zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })
    : buffer;
}
