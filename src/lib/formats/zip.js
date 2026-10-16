// Minimal ZIP reader over a Blob/File: only the central directory and requested entries are
// read, so multi-GB Strava archives (photos included) never load fully into memory.
// ponytail: no ZIP64 (archives > 4 GB or > 65535 entries), add it if users hit the error.

/** List entries of a ZIP Blob: [{ name, bytes(): Promise<Uint8Array> }]. */
export async function readZip(blob) {
  const tailStart = Math.max(0, blob.size - 65557); // EOCD (22 bytes) + max comment length
  const tail = new DataView(await blob.slice(tailStart).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Archive ZIP invalide.');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('Archive trop volumineuse (ZIP64 non supporté).');

  const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const utf8 = new TextDecoder();
  const entries = [];
  for (let p = 0, n = 0; n < count; n++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('Archive ZIP corrompue.');
    const method = cd.getUint16(p + 10, true);
    const size = cd.getUint32(p + 20, true);
    const nameLen = cd.getUint16(p + 28, true);
    const skip = cd.getUint16(p + 30, true) + cd.getUint16(p + 32, true);
    const offset = cd.getUint32(p + 42, true);
    const name = utf8.decode(new Uint8Array(cd.buffer, p + 46, nameLen));
    p += 46 + nameLen + skip;
    if (name.endsWith('/')) continue;
    entries.push({
      name,
      async bytes() {
        const local = new DataView(await blob.slice(offset, offset + 30).arrayBuffer());
        const start = offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
        const data = new Uint8Array(await blob.slice(start, start + size).arrayBuffer());
        if (method === 0) return data;
        if (method === 8) return inflate(data, 'deflate-raw');
        throw new Error(`Compression ZIP non supportée (méthode ${method}).`);
      },
    });
  }
  return entries;
}

/** Decompress with the platform DecompressionStream ('gzip' | 'deflate-raw'). */
export async function inflate(data, format) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
