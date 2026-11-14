/* Packs the site into api/disc/site.bin: a SITEBIN1 archive the index and the
   boot shell unpack at runtime.

   layout: "SITEBIN1" (8 bytes) | uint32 header length | JSON header | payload
   header: { v: 1, files: [{ name, type, offset, size }] }, offsets from payload start

   Sources are read from this folder; if a loose copy is gone the entry is reused
   from the existing archive, so editing model.js alone is enough to repack. */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = import.meta.dirname;
const OUT_DIR = join(ROOT, "api", "disc");
const OUT = join(OUT_DIR, "site.bin");
const MAGIC = "SITEBIN1";

const ENTRIES = [
  ["game.html", "text/html; charset=utf-8"],
  ["model.js", "text/javascript; charset=utf-8"],
  ["xbox_one_s.glb", "model/gltf-binary"],
  ["xb1.png", "image/png"]
];

function readArchive() {
  const files = new Map();
  try {
    const bytes = readFileSync(OUT);
    if (bytes.subarray(0, 8).toString("latin1") !== MAGIC) return files;
    const headerLength = bytes.readUInt32LE(8);
    const header = JSON.parse(bytes.subarray(12, 12 + headerLength).toString("utf8"));
    const base = 12 + headerLength;
    for (const file of header.files) files.set(file.name, bytes.subarray(base + file.offset, base + file.offset + file.size));
  } catch {
    // no archive yet
  }
  return files;
}

const previous = readArchive();
const files = [];
const chunks = [];
let offset = 0;

for (const [name, type] of ENTRIES) {
  let data;
  try {
    data = readFileSync(join(ROOT, name));
  } catch {
    const reused = previous.get(name);
    if (!reused) throw new Error(name + ": no loose file here and no copy in the existing site.bin");
    data = Buffer.from(reused);
  }
  files.push({ name, type, offset, size: data.length });
  chunks.push(data);
  offset += data.length;
}

const header = Buffer.from(JSON.stringify({ v: 1, files }), "utf8");
const head = Buffer.alloc(12);
head.write(MAGIC, 0, "ascii");
head.writeUInt32LE(header.length, 8);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, Buffer.concat([head, header, ...chunks]));

console.log("wrote " + relative(ROOT, OUT) + " (" + statSync(OUT).size + " bytes)");
for (const file of files) console.log("  " + file.name.padEnd(16) + String(file.size).padStart(9) + " bytes");
