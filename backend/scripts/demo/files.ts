import { crc32, deflateSync } from "node:zlib";

/** PDF de uma página com linhas de texto (Helvetica), válido e com a tabela de referências correta. */
export function makePdf(lines: string[]): Buffer {
  const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?");
  const content = [
    "BT /F1 18 Tf 56 760 Td",
    ...lines.map((line, index) => `${index === 0 ? "" : "0 -26 Td "}(${escape(line)}) Tj`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** PNG de um "comprovante": papel claro, faixa de título e linhas de texto simuladas. */
export function makeReceiptPng(seed: number): Buffer {
  const width = 360;
  const height = 480;
  const pixels = Buffer.alloc((width * 3 + 1) * height, 0xff);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const at = y * (width * 3 + 1) + 1 + x * 3;
    pixels[at] = r;
    pixels[at + 1] = g;
    pixels[at + 2] = b;
  };
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0; // filtro "nenhum" de cada linha
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const border = x < 6 || x >= width - 6 || y < 6 || y >= height - 6;
      if (border) set(x, y, 0xe3, 0xe6, 0xeb);
      else if (y < 70) set(x, y, 0x15, 0x60, 0xd4);
    }
  }
  let state = seed || 1;
  const next = () => (state = (state * 1103515245 + 12345) & 0x7fffffff);
  for (let line = 0; line < 14; line++) {
    const y = 100 + line * 26;
    const end = 60 + (next() % 220);
    for (let x = 28; x < end; x++) for (let dy = 0; dy < 7; dy++) set(x, y + dy, 0x42, 0x47, 0x4e);
  }
  for (let x = 28; x < width - 28; x++) for (let dy = 0; dy < 4; dy++) set(x, 450 + dy, 0x15, 0x60, 0xd4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bits por canal
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
