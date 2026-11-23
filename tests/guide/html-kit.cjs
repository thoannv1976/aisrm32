/**
 * Bộ dựng PDF có cùng giao diện hàm với docx-kit.cjs (p, h1, h2, figure, table, steps…): sinh HTML rồi in PDF bằng Chrome
 * (Playwright) — không cần Word / LibreOffice. Dùng cho: node tests/guide/build-workflows.cjs --pdf
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const OUT = path.join(__dirname, '..', '..', 'docs', 'huong-dan-su-dung');
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CSS = `
@page { size: A4; margin: 20mm 20mm 18mm 20mm; }
body { font-family: Arial, 'Segoe UI', sans-serif; font-size: 11pt; line-height: 1.38; color: #222; }
h1 { font-size: 16pt; color: #1F3A5F; margin: 0 0 10pt; page-break-before: always; }
h2 { font-size: 13.5pt; color: #1F3A5F; margin: 16pt 0 6pt; page-break-after: avoid; }
h3 { font-size: 11.5pt; color: #333; margin: 12pt 0 4pt; page-break-after: avoid; }
p { margin: 0 0 6pt; }
ul, ol { margin: 0 0 6pt; padding-left: 22pt; }
li { margin-bottom: 3pt; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; font-size: 10pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th { background: #1F3A5F; color: #fff; text-align: left; padding: 4pt 5pt; border: 1px solid #1F3A5F; }
td { padding: 4pt 5pt; border: 1px solid #c9d2dc; vertical-align: top; }
tr:nth-child(even) td { background: #f6f8fa; }
.box { margin: 5pt 0 9pt; padding: 6pt 8pt; border-left: 4pt solid; page-break-inside: avoid; }
.fig { page-break-inside: avoid; margin: 6pt 0 4pt; text-align: center; }
.fig img { max-width: 100%; max-height: 205mm; border: 1px solid #ccc; }
.cap { text-align: center; font-style: italic; font-size: 9pt; color: #555; margin: 3pt 0 6pt; }
.note { display: flex; gap: 6pt; margin: 0 0 3pt; page-break-inside: avoid; }
.note b.n { color: #C62828; min-width: 14pt; }
.check { margin: 0 0 4pt 14pt; text-indent: -14pt; }
.sp { height: 4pt; }
.pb { page-break-after: always; }
.toc a { color: #1F3A5F; text-decoration: none; }
.toc .l1 { font-weight: bold; margin-top: 5pt; }
.toc .l2 { margin-left: 16pt; }
`;

function createHtmlKit({ manifests = ['all'] } = {}) {
  const manifest = manifests.flatMap((m) => JSON.parse(fs.readFileSync(path.join(OUT, `manifest-${m}.json`), 'utf8')));
  const byId = new Map(manifest.map((m) => [m.id, m]));
  let figNo = 1;
  let anchor = 0;
  const heads = [];

  const runs = (text) =>
    String(text)
      .split(/(\*\*[^*]+\*\*)/)
      .filter(Boolean)
      .map((t) => (t.startsWith('**') ? `<b>${esc(t.slice(2, -2))}</b>` : esc(t)))
      .join('');
  const p = (t) => `<p>${runs(t)}</p>`;
  const head = (lvl, t) => {
    const id = `h${++anchor}`;
    if (lvl <= 2) heads.push({ lvl, t, id });
    return `<h${lvl} id="${id}">${esc(t)}</h${lvl}>`;
  };
  const h1 = (t) => head(1, t);
  const h2 = (t) => head(2, t);
  const h3 = (t) => `<h3>${esc(t)}</h3>`;
  const bullet = (t) => `<ul><li>${runs(t)}</li></ul>`;
  const check = (t) => `<p class="check">☐&nbsp; ${runs(t)}</p>`;
  const steps = (items) => [`<ol>${items.map((t) => `<li>${runs(t)}</li>`).join('')}</ol>`];
  const box = (title, t, fill = '#FFF8E1', line = '#F9A825') =>
    `<div class="box" style="background:${fill.startsWith('#') ? fill : '#' + fill};border-color:${line.startsWith('#') ? line : '#' + line}"><b>${esc(title)}</b> ${runs(t)}</div>`;
  const note = (t) => box('Lưu ý:', t);
  const tip = (t) => box('Gợi ý:', t, 'E8F5E9', '43A047');
  const discuss = (t) => box('Thảo luận:', t, 'E3F2FD', '1E88E5');
  const spacer = () => '<div class="sp"></div>';
  const pageBreak = () => '<div class="pb"></div>';
  const toc = () => ['<h2 style="font-size:16pt">Mục lục</h2>', '%%TOC%%'];
  const centered = (text, run = {}, para = {}) => {
    const st = [`text-align:center`, `font-size:${(run.size ?? 22) / 2}pt`, run.bold ? 'font-weight:bold' : '', run.italics ? 'font-style:italic' : '', run.color ? `color:#${run.color}` : '', `margin-top:${(para.spacing?.before ?? 0) / 20}pt`, `margin-bottom:${(para.spacing?.after ?? 60) / 20}pt`];
    return `<p style="${st.filter(Boolean).join(';')}">${esc(text)}</p>`;
  };
  function table(headers, rows, widths) {
    const total = widths.reduce((a, b) => a + b, 0);
    return `<table><colgroup>${widths.map((w) => `<col style="width:${((w / total) * 100).toFixed(1)}%">`).join('')}</colgroup><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${runs(c).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function figure(id, opts = {}) {
    const m = byId.get(id);
    if (!m) throw new Error(`Thiếu ảnh ${id}`);
    const n = figNo++;
    const title = opts.title ?? m.title;
    const src = pathToFileURL(path.join(OUT, 'anh', m.file)).href;
    return [
      `<div class="fig">${opts.heading !== false ? h3(title).replace('<h3>', '<h3 style="text-align:left">') : ''}<img src="${src}"><div class="cap">Hình ${n}. ${esc(title)}</div></div>`,
      ...m.notes.map((t, i) => `<div class="note"><b class="n">${CIRCLED[i]}</b><span>${runs(t)}</span></div>`),
    ];
  }

  async function save(body, { fileName, title, header, outDir }) {
    const tocHtml = `<div class="toc">${heads.map((h) => `<div class="l${h.lvl}"><a href="#${h.id}">${esc(h.t)}</a></div>`).join('')}</div>`;
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body.flat().join('\n').replace('%%TOC%%', tocHtml)}</body></html>`;
    const tmp = path.join(os.tmpdir(), `aisrm-${fileName.replace(/\.\w+$/, '')}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
      const file = path.join(outDir ?? OUT, fileName.replace(/\.docx$/, '.pdf'));
      await page.pdf({
        path: file,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        margin: { top: '20mm', bottom: '18mm', left: '20mm', right: '20mm' },
        headerTemplate: `<div style="width:100%;font-size:7pt;color:#888;text-align:right;padding:0 20mm;font-family:Arial">${esc(header)}</div>`,
        footerTemplate: '<div style="width:100%;font-size:8pt;color:#666;text-align:center;font-family:Arial">Trang <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      const pages = (fs.readFileSync(file).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      console.log(`Đã ghi ${file} (${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB, ${figNo - 1} hình, ${pages} trang)`);
    } finally {
      await browser.close();
    }
  }

  return { manifest, byId, runs, p, h1, h2, h3, bullet, check, steps, note, tip, discuss, box, figure, table, spacer, pageBreak, toc, centered, save };
}

module.exports = { createHtmlKit };
