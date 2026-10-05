// Write a tEXt chunk into a PNG so a generated image carries a note on where it came from.
import { readFileSync, writeFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';

const KEYWORD = 'impeccable:prompt';

export function addPngText(file, text, keyword = KEYWORD) {
  const png = readFileSync(file);
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  // Drop an earlier note with the same keyword, then insert the new one after IHDR.
  const chunks = [];
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at);
    const end = at + 12 + len;
    const type = png.toString('latin1', at + 4, at + 8);
    const own = type === 'tEXt' && png.toString('latin1', at + 8, at + 8 + keyword.length + 1) === `${keyword}\0`;
    if (!own) chunks.push(png.subarray(at, end));
    at = end;
  }
  const body = Buffer.concat([Buffer.from(`${keyword}\0`, 'latin1'), Buffer.from(text.replace(/[^\x20-\x7e\n]/g, '?'), 'latin1')]);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write('tEXt', 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  writeFileSync(file, Buffer.concat([png.subarray(0, 8), chunks[0], head, body, crc, ...chunks.slice(1)]));
}
