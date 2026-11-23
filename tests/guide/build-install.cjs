/**
 * Chuyển hướng dẫn cài đặt (Markdown) sang Word: deploy/local/HUONG_DAN_CAI_DAT.md, deploy/online/HUONG_DAN_CAI_DAT_ONLINE.md,
 * deploy/pc/HUONG_DAN_CAI_TREN_PC.md.
 *   node tests/guide/build-install.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { Paragraph, TextRun, ShadingType } = require('docx');
const { createKit } = require('./docx-kit.cjs');

async function convert(mdFile, fileName, title, version = '1.0.1') {
  const k = createKit({ manifests: [] });
  const { p, h1, h2, h3, bullet, steps, table, centered, pageBreak, toc } = k;
  const lines = fs.readFileSync(mdFile, 'utf8').replace(/\r/g, '').split('\n');
  const body = [
    centered('AI-SRM', { bold: true, size: 40, color: '1F3A5F' }, { spacing: { before: 2000 } }),
    centered(title.toUpperCase(), { bold: true, size: 44, color: '1F3A5F' }, { spacing: { before: 400, after: 600 } }),
    centered(`Phiên bản ${version} · 11/2026`, { size: 22, color: '555555' }),
    pageBreak(),
    ...toc(),
  ];
  let first = true;
  let num = [];
  const flushNum = () => {
    if (num.length) body.push(...steps(num));
    num = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/^\d+\. /.test(l) && !/^ {2,}\S/.test(l)) flushNum();
    if (l.startsWith('# ')) {
      if (first) { first = false; continue; } // tiêu đề tài liệu đã ở bìa
      body.push(h1(l.slice(2)));
    } else if (l.startsWith('## ')) body.push(first ? h2(l.slice(3)) : h1(l.slice(3)));
    else if (l.startsWith('### ')) body.push(h2(l.slice(4)));
    else if (l.startsWith('```')) {
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      for (const c of code)
        body.push(new Paragraph({ spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' }, indent: { left: 200 }, children: [new TextRun({ text: c || ' ', font: 'Consolas', size: 19 })] }));
      body.push(p(''));
    } else if (l.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      i--;
      const cells = rows.filter((r) => !/^\|[\s:-]+\|/.test(r.replace(/[^|:\s-]/g, 'x')) || /[^|\s:-]/.test(r)).filter((r) => !/^\|(\s*:?-+:?\s*\|)+\s*$/.test(r)).map((r) => r.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, '')));
      body.push(table(cells[0], cells.slice(1), cells[0].map((_, j) => (j === 0 ? 3 : 4))), p(''));
    } else if (/^- /.test(l)) body.push(bullet(l.slice(2).replace(/`/g, '')));
    else if (/^ {2,}- /.test(l)) body.push(bullet('   ' + l.trim().slice(2).replace(/`/g, '')));
    else if (/^\d+\. /.test(l)) num.push(l.replace(/^\d+\. /, '').replace(/`/g, ''));
    else if (/^ {2,}\S/.test(l) && num.length) num[num.length - 1] += ' ' + l.trim().replace(/^- /, '').replace(/`/g, '');
    else if (l.trim()) body.push(p(l.replace(/`/g, '')));
  }
  flushNum();
  await k.save(body, { fileName, title: `AI-SRM — ${title}`, header: `AI-SRM · ${title}` });
}

(async () => {
  const root = path.join(__dirname, '..', '..', 'deploy');
  await convert(path.join(root, 'local', 'HUONG_DAN_CAI_DAT.md'), 'HUONG_DAN_CAI_DAT_LOCAL.docx', 'Hướng dẫn cài đặt bản Local');
  await convert(path.join(root, 'online', 'HUONG_DAN_CAI_DAT_ONLINE.md'), 'HUONG_DAN_CAI_DAT_ONLINE.docx', 'Hướng dẫn cài đặt bản Online', '1.0');
  await convert(path.join(root, 'pc', 'HUONG_DAN_CAI_TREN_PC.md'), 'HUONG_DAN_CAI_TREN_PC.docx', 'Hướng dẫn cài AI-SRM trên PC');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
