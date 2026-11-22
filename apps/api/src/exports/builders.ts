/**
 * Dựng tệp Word (.docx) và Excel (.xlsx) theo mẫu chuẩn của AI-SRM.
 * Mẫu của từng trường có thể thay sau: các hàm chỉ nhận dữ liệu đã chuẩn hóa (tiêu đề, đoạn, bảng).
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import ExcelJS from 'exceljs';

const FONT = 'Times New Roman';
const CONTENT_W = 9638;

export type Block =
  | { kind: 'title'; text: string }
  | { kind: 'subtitle'; text: string }
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right' | 'justify' }
  | { kind: 'kv'; items: [string, string][] }
  | { kind: 'table'; headers: string[]; rows: (string | number | null | undefined)[][]; widths?: number[] }
  | { kind: 'signatures'; items: { role: string; name: string }[] }
  | { kind: 'spacer' };

const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) => new TextRun({ text, font: FONT, size: o.size ?? 26, bold: o.bold, italics: o.italics });

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };

function cell(text: string, width: number, head = false) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, fill: 'E7ECF3', color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: String(text)
      .split('\n')
      .map((line) => new Paragraph({ children: [run(line, { bold: head, size: 22 })] })),
  });
}

function table(headers: string[], rows: (string | number | null | undefined)[][], widths?: number[]) {
  const w = widths ?? headers.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const scaled = w.map((x) => Math.floor((x / total) * CONTENT_W));
  scaled[scaled.length - 1] += CONTENT_W - scaled.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: '888888' };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: scaled,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, scaled[i], true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v === null || v === undefined || v === '' ? '—' : String(v), scaled[i])) })),
    ],
  });
}

export async function buildDocx(opts: { title: string; header?: { left: string; right: string }; blocks: Block[]; footerNote?: string }): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  if (opts.header) {
    children.push(
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
        borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
        rows: [
          new TableRow({
            children: [opts.header.left, opts.header.right].map(
              (t) =>
                new TableCell({
                  width: { size: CONTENT_W / 2, type: WidthType.DXA },
                  children: t.split('\n').map((line, i) => new Paragraph({ alignment: AlignmentType.CENTER, children: [run(line, { bold: i < 2, size: 24 })] })),
                }),
            ),
          }),
        ],
      }),
      new Paragraph({ children: [] }),
    );
  }
  for (const b of opts.blocks) {
    switch (b.kind) {
      case 'title':
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 120 }, children: [run(b.text.toUpperCase(), { bold: true, size: 30 })] }));
        break;
      case 'subtitle':
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [run(b.text, { italics: true })] }));
        break;
      case 'h1':
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, keepNext: true, children: [run(b.text, { bold: true, size: 27 })] }));
        break;
      case 'h2':
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 }, keepNext: true, children: [run(b.text, { bold: true, italics: true })] }));
        break;
      case 'p':
        for (const line of b.text.split('\n'))
          children.push(new Paragraph({ alignment: ALIGN[b.align ?? 'justify'], spacing: { after: 80 }, children: [run(line, { bold: b.bold, italics: b.italic })] }));
        break;
      case 'kv':
        for (const [k, v] of b.items) children.push(new Paragraph({ spacing: { after: 60 }, children: [run(`${k}: `, { bold: true }), run(v || '—')] }));
        break;
      case 'table':
        children.push(table(b.headers, b.rows, b.widths), new Paragraph({ children: [] }));
        break;
      case 'signatures':
        children.push(
          new Paragraph({ children: [] }),
          new Table({
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnWidths: b.items.map(() => Math.floor(CONTENT_W / b.items.length)),
            borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: [
              new TableRow({
                children: b.items.map(
                  (s) =>
                    new TableCell({
                      width: { size: Math.floor(CONTENT_W / b.items.length), type: WidthType.DXA },
                      children: [
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [run(s.role.toUpperCase(), { bold: true })] }),
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [run('(Ký, ghi rõ họ tên)', { italics: true, size: 22 })] }),
                        new Paragraph({ children: [] }),
                        new Paragraph({ children: [] }),
                        new Paragraph({ children: [] }),
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [run(s.name, { bold: true })] }),
                      ],
                    }),
                ),
              }),
            ],
          }),
        );
        break;
      case 'spacer':
        children.push(new Paragraph({ children: [] }));
        break;
    }
  }
  const doc = new Document({
    creator: 'AI-SRM',
    title: opts.title,
    styles: { default: { document: { run: { font: FONT, size: 26 }, paragraph: { spacing: { line: 300 } } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ font: FONT, size: 18, color: '777777', children: [`${opts.footerNote ? opts.footerNote + ' · ' : ''}Trang `, PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES] })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export interface SheetSpec {
  name: string;
  title?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  widths?: number[];
  note?: string;
}

/** Excel nhiều trang tính; chặn công thức (CSV/Excel injection) bằng cách ghi mọi ô văn bản dạng chuỗi. */
export async function buildXlsx(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AI-SRM';
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
    let r = 1;
    if (s.title) {
      ws.getCell(r, 1).value = s.title;
      ws.getCell(r, 1).font = { bold: true, size: 13 };
      r += 2;
    }
    const head = ws.getRow(r);
    s.headers.forEach((h, i) => {
      const c = head.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
      c.alignment = { vertical: 'middle', wrapText: true };
    });
    ws.views = [{ state: 'frozen', ySplit: r }];
    for (const row of s.rows) {
      r++;
      const xr = ws.getRow(r);
      row.forEach((v, i) => {
        const c = xr.getCell(i + 1);
        if (typeof v === 'number') c.value = v;
        else if (v === null || v === undefined) c.value = null;
        else c.value = { richText: [{ text: String(v) }] };
        c.alignment = { vertical: 'top', wrapText: true };
      });
    }
    s.headers.forEach((_h, i) => (ws.getColumn(i + 1).width = s.widths?.[i] ?? 18));
    if (s.note) {
      r += 2;
      ws.getCell(r, 1).value = s.note;
      ws.getCell(r, 1).font = { italic: true, color: { argb: 'FF666666' } };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
