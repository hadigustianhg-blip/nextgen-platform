import "server-only";
import writeXlsxFile, { type SheetData } from "write-excel-file/node";

const header = (values: string[]): SheetData[number] =>
  values.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#E2E8F0" }));

export async function createWorkbook(
  sheets: Array<{ name: string; headers: string[]; rows: Array<Array<string | number>> }>,
) {
  return writeXlsxFile(sheets.map((sheet) => ({
    sheet: sheet.name,
    data: [header(sheet.headers), ...sheet.rows],
  }))).toBuffer();
}
