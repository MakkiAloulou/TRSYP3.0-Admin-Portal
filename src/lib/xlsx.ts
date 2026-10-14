// Excel exports. Used from the browser (participants, payments, teams) and
// from the rooms server action, so it is neither server-only nor client-only.

export type XlsxCell = string | number;

/** A column of an export: its heading and how to fill it from one record. */
export type XlsxColumn<T> = { header: string; value: (record: T) => XlsxCell };

type BuildOptions = {
  sheet: string;
  /** A bold, frozen first row. */
  header?: string[];
  /** An ARGB fill for a data row (0-based), or nothing to leave it plain. */
  fill?: (rowIndex: number) => string | undefined;
};

const WIDTH_MIN = 8;
const WIDTH_MAX = 50;

/**
 * An .xlsx of `rows`. Every value is written as plain text or a number, never
 * a formula, so a name starting with "=" or a phone number starting with "+"
 * arrives as typed.
 */
export async function buildXlsx(rows: XlsxCell[][], { sheet, header, fill }: BuildOptions): Promise<Uint8Array> {
  // Loaded on demand: the library is large and only needed at export time.
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheet, header ? { views: [{ state: 'frozen', ySplit: 1 }] } : {});

  if (header) worksheet.addRow(header).font = { bold: true };

  rows.forEach((values, i) => {
    const row = worksheet.addRow(values);
    const color = fill?.(i);
    if (!color) return;
    for (let column = 1; column <= values.length; column++) {
      row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    }
  });

  // Wide enough for the longest value, within reason.
  const all = header ? [header, ...rows] : rows;
  const columnCount = Math.max(0, ...all.map((r) => r.length));
  for (let c = 0; c < columnCount; c++) {
    const longest = Math.max(0, ...all.map((r) => String(r[c] ?? '').length));
    worksheet.getColumn(c + 1).width = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, longest + 2));
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** The header row and data rows of `records` under `columns`, for buildXlsx. */
export function tabulate<T>(columns: XlsxColumn<T>[], records: T[]) {
  return {
    header: columns.map((c) => c.header),
    rows: records.map((r) => columns.map((c) => c.value(r))),
  };
}

/** Triggers a browser download of an .xlsx built by buildXlsx. */
export function downloadXlsx(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
