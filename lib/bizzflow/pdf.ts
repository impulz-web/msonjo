function safeText(value: string) {
  return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/([\\()])/g, '\\$1');
}

export function pdfText(value: string, x: number, y: number, size = 9, color = '0.15 0.15 0.15') {
  return `BT /F1 ${size} Tf ${color} rg ${x} ${y} Td (${safeText(value)}) Tj ET\n`;
}

function brandHeader(businessName: string, title: string, subtitle: string, continued: boolean) {
  return [
    '0.89 0.12 0.14 rg 0 760 595 82 re f\n',
    '1 0.84 0 rg 0 754 595 6 re f\n',
    pdfText(businessName, 40, 808, 16, '1 1 1'),
    pdfText(title.toUpperCase(), 40, 784, 10, '1 1 1'),
    pdfText(`${subtitle}${continued ? ' (continued)' : ''}`, 40, 735, 9),
    '0.89 0.12 0.14 RG 40 722 m 555 722 l S\n',
  ].join('');
}

export function createBrandedPdf(
  businessName: string,
  title: string,
  subtitle: string,
  lines: string[],
) {
  const pages: string[] = [];
  let content = '';
  let y = 704;
  let continued = false;

  const startPage = () => {
    content = brandHeader(businessName, title, subtitle, continued);
    y = 704;
  };
  const finishPage = () => {
    content += pdfText('MSONJO GAS & HOUSE HOLD', 40, 28, 8, '0.35 0.35 0.35');
    pages.push(content);
    continued = true;
  };

  startPage();
  for (const line of lines) {
    if (y < 48) {
      finishPage();
      startPage();
    }
    content += pdfText(line, 40, y, 8.5);
    y -= 15;
  }
  finishPage();

  const pageIds = pages.map((_, index) => 3 + index * 2);
  const fontId = 3 + pages.length * 2;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];

  pages.forEach((page, index) => {
    const pageId = 3 + index * 2;
    const streamId = pageId + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(page, 'ascii')} >>\nstream\n${page}endstream`,
    );
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document, 'ascii'));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, 'ascii');
}
