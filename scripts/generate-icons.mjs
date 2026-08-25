#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const ICON_SIZES = Object.freeze([180, 192, 512]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

const insideRoundedRect = (x, y, left, top, right, bottom, radius) => {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};

export function iconPng(size) {
  if (!ICON_SIZES.includes(size)) throw new Error(`Unsupported icon size ${size}`);
  const pixels = Buffer.alloc(size * size * 4);
  const paint = (index, color) => {
    pixels[index] = color[0]; pixels[index + 1] = color[1]; pixels[index + 2] = color[2]; pixels[index + 3] = 255;
  };
  const bg = [14, 20, 27], teal = [45, 212, 191], pale = [232, 238, 244], dark = [4, 35, 30];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    paint(i, bg);
    if (insideRoundedRect(x, y, size * .09, size * .09, size * .91, size * .91, size * .17)) paint(i, teal);
    const dx = x - size * .50, dy = y - size * .57;
    const plateOuter = dx * dx + dy * dy <= (size * .25) ** 2;
    const plateInner = dx * dx + dy * dy <= (size * .18) ** 2;
    if (plateOuter) paint(i, pale);
    if (plateInner) paint(i, dark);
    const leafX = (x - size * .55) / (size * .16), leafY = (y - size * .30) / (size * .10);
    if ((leafX + leafY) ** 2 + (leafX - leafY) ** 2 * .32 <= 1) paint(i, dark);
    if (Math.abs(x - (size * .46 + (y - size * .38) * .48)) <= size * .012 && y >= size * .28 && y <= size * .48) paint(i, pale);
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function iconProblems(root = ".") {
  const problems = [];
  for (const size of ICON_SIZES) {
    const file = path.join(root, "public", "icons", `icon-${size}.png`);
    const expected = iconPng(size);
    if (!fs.existsSync(file)) problems.push(`missing ${file}`);
    else if (!fs.readFileSync(file).equals(expected)) problems.push(`${file} is not the deterministic generated ${size}px icon`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const problems = iconProblems();
    if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
    console.log("Deterministic install icons are current.");
  } else {
    fs.mkdirSync("public/icons", { recursive: true });
    for (const size of ICON_SIZES) fs.writeFileSync(`public/icons/icon-${size}.png`, iconPng(size));
    console.log(`Generated ${ICON_SIZES.length} deterministic install icons.`);
  }
}
