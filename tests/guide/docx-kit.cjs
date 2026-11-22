/**
 * Bộ dựng tài liệu Word dùng chung cho Hướng dẫn sử dụng và Tài liệu thực hành:
 * hình chụp có ghi chú ①②③ (từ manifest-all.json của tests/guide/capture.spec.ts), bảng, lưu ý, mục lục.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType,
} = require('docx');

const OUT = path.join(__dirname, '..', '..', 'docs', 'huong-dan-su-dung');
const FONT = 'Arial';
const CONTENT_W = 9638; // A4 (11906) − lề 2×1134 DXA
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const RED = 'C62828';
const NAVY = '1F3A5F';

function createKit() {
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest-all.json'), 'utf8'));
  const byId = new Map(manifest.map((m) => [m.id, m]));
  const figNoOf = new Map();
  let figNo = 1;

  /** Văn bản có **đậm**. */
  const runs = (text, base = {}) =>
    String(text)
      .split(/(\*\*[^*]+\*\*)/)
      .filter(Boolean)
      .map((t) => (t.startsWith('**') ? new TextRun({ ...base, text: t.slice(2, -2), bold: true }) : new TextRun({ ...base, text: t })));
  const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: runs(text) });
  const h1 = (t, opts = {}) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, ...opts, children: [new TextRun(t)] });
  const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
  const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
  const label = (t) => new Paragraph({ spacing: { before: 120, after: 60 }, keepNext: true, children: [new TextRun({ text: t, bold: true, color: NAVY })] });
  const bullet = (t) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 }, children: runs(t) });
  const check = (t) => new Paragraph({ spacing: { after: 60 }, indent: { left: 400, hanging: 340 }, children: [new TextRun({ text: '☐  ' }), ...runs(t)] });
  let stepList = 0;
  /** Danh sách bước đánh số 1, 2, 3… — mỗi lần gọi steps() bắt đầu lại từ 1. */
  const steps = (items) => {
    const instance = ++stepList;
    return items.map((t) => new Paragraph({ numbering: { reference: 'steps', level: 0, instance }, spacing: { after: 60 }, children: runs(t) }));
  };
  const box = (title, t, fill = 'FFF8E1', line = 'F9A825') =>
    new Paragraph({
      spacing: { before: 60, after: 120 },
      shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: line, space: 6 } },
      indent: { left: 120 },
      children: [new TextRun({ text: `${title} `, bold: true }), ...runs(t)],
    });
  const note = (t) => box('Lưu ý:', t);
  const tip = (t) => box('Gợi ý:', t, 'E8F5E9', '43A047');
  const discuss = (t) => box('Thảo luận:', t, 'E3F2FD', '1E88E5');

  function jpegSize(buf) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return null;
  }

  /** "Hình n" của một ảnh đã đưa vào tài liệu. */
  const ref = (id) => {
    if (!figNoOf.has(id)) throw new Error(`Chưa có hình ${id} để dẫn chiếu`);
    return `Hình ${figNoOf.get(id)}`;
  };

  /** Ảnh + chú thích + ghi chú ①②③ khớp với ô đỏ trên ảnh. */
  function figure(id, opts = {}) {
    const m = byId.get(id);
    if (!m) throw new Error(`Thiếu ảnh ${id}`);
    const buf = fs.readFileSync(path.join(OUT, 'anh', m.file));
    const { w, h } = jpegSize(buf);
    let width = 6.6 * 96;
    let height = (h / w) * width;
    const maxH = (opts.maxHeightIn ?? 8.2) * 96;
    if (height > maxH) {
      height = maxH;
      width = (w / h) * height;
    }
    const n = figNo++;
    figNoOf.set(id, n);
    const title = opts.title ?? m.title;
    const out = [];
    if (opts.heading !== false) out.push(h3(title));
    if (opts.lead) out.push(...[].concat(opts.lead).map((t) => p(t, { keepNext: true })));
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
        keepNext: true,
        children: [new ImageRun({ type: 'jpg', data: buf, transformation: { width: Math.round(width), height: Math.round(height) }, altText: { title, description: title, name: m.id } })],
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, keepNext: m.notes.length > 0, children: [new TextRun({ text: `Hình ${n}. ${title}`, italics: true, size: 18, color: '555555' })] }),
    );
    m.notes.forEach((t, i) =>
      out.push(
        new Paragraph({
          spacing: { after: 60 },
          keepNext: i < m.notes.length - 1,
          keepLines: true,
          indent: { left: 400, hanging: 400 },
          tabStops: [{ type: 'left', position: 400 }],
          children: [new TextRun({ text: `${CIRCLED[i]}\t`, bold: true, color: RED }), ...runs(t)],
        }),
      ),
    );
    return out;
  }

  function table(headers, rows, widths, opts = {}) {
    const total = widths.reduce((a, b) => a + b, 0);
    const scaled = widths.map((x) => Math.floor((x / total) * CONTENT_W));
    scaled[scaled.length - 1] += CONTENT_W - scaled.reduce((a, b) => a + b, 0);
    const cell = (t, head, i) =>
      new TableCell({
        width: { size: scaled[i], type: WidthType.DXA },
        shading: head ? { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: String(t)
          .split('\n')
          .map((line) => new Paragraph({ spacing: { after: opts.tall && !head ? 360 : 0 }, children: head ? [new TextRun({ text: line, bold: true, color: 'FFFFFF' })] : runs(line) })),
      });
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: scaled,
      rows: [new TableRow({ tableHeader: true, children: headers.map((t, i) => cell(t, true, i)) }), ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, false, i)) }))],
    });
  }

  const spacer = () => new Paragraph({ spacing: { after: 120 }, children: [] });
  const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
  const toc = () => [
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Mục lục', bold: true, size: 32, color: NAVY })] }),
    new TableOfContents('Mục lục', { hyperlink: true, headingStyleRange: '1-2' }),
  ];
  const centered = (text, run = {}, para = {}) => new Paragraph({ alignment: AlignmentType.CENTER, ...para, children: [new TextRun({ text, ...run })] });

  async function save(body, { fileName, title, header }) {
    const doc = new Document({
      creator: 'AI-SRM',
      title,
      features: { updateFields: true },
      styles: {
        default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 276 } } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 200 }, keepNext: true, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 27, bold: true, color: NAVY }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
          { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 23, bold: true, color: '333333' }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true, outlineLevel: 2 } },
        ],
      },
      numbering: {
        config: [
          { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
          { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
        ],
      },
      sections: [
        {
          properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
          headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: header, size: 16, color: '888888' })] })] }) },
          footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 18, color: '666666' })] })] }) },
          children: body,
        },
      ],
    });
    const buf = await Packer.toBuffer(doc);
    const file = path.join(OUT, fileName);
    fs.writeFileSync(file, buf);
    console.log(`Đã ghi ${file} (${(buf.length / 1024 / 1024).toFixed(1)} MB, ${figNo - 1} hình)`);
  }

  return { manifest, byId, runs, p, h1, h2, h3, label, bullet, check, steps, note, tip, discuss, figure, ref, table, spacer, pageBreak, toc, centered, save, TextRun, Paragraph, AlignmentType };
}

module.exports = { createKit, OUT };
