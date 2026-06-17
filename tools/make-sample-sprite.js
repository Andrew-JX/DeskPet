'use strict';

// 纯 Node（无依赖）生成一张测试用「绿底精灵图」：5 列 × 4 行 = 20 帧。
// 每行一种姿态（idle/walk/happy/sleep），帧间有位移，方便验证抠图 + 切帧 + 动画。
// 输出：samples/sample-dog-greenscreen.png 与 web-demo/sample.png
// 用法：node tools/make-sample-sprite.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COLS = 5, ROWS = 4, F = 200;        // 每帧 200px
const W = COLS * F, H = ROWS * F;
const GREEN = [0, 200, 0];                 // 纯绿底，便于 chroma key

const buf = Buffer.alloc(W * H * 4);
// 填充绿底
for (let i = 0; i < W * H; i++) {
  buf[i * 4] = GREEN[0]; buf[i * 4 + 1] = GREEN[1]; buf[i * 4 + 2] = GREEN[2]; buf[i * 4 + 3] = 255;
}

function setPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
}
function disc(cx, cy, rad, color) {
  for (let y = -rad; y <= rad; y++)
    for (let x = -rad; x <= rad; x++)
      if (x * x + y * y <= rad * rad) setPx(Math.round(cx + x), Math.round(cy + y), color[0], color[1], color[2]);
}

const BODY = [150, 100, 60], EAR = [110, 70, 40], BELLY = [235, 220, 200], EYE = [30, 30, 30];

// 画一只朝向相机的小狗，ox/oy 为帧内偏移，pose 控制姿态细节
function drawDog(fx, fy, ox, oy, pose) {
  const cx = fx + F / 2 + ox, cy = fy + F / 2 + oy + 10;
  // 耳朵
  disc(cx - 42, cy - 48, 22, EAR);
  disc(cx + 42, cy - 48, 22, EAR);
  // 头/身
  disc(cx, cy, 62, BODY);
  // 肚皮
  disc(cx, cy + 18, 34, BELLY);
  // 眼睛
  if (pose === 'sleep') {
    for (let x = -12; x <= 12; x++) { setPx(cx - 24 + x, cy - 8, EYE[0], EYE[1], EYE[2]); setPx(cx + 24 + x, cy - 8, EYE[0], EYE[1], EYE[2]); }
  } else {
    const er = pose === 'happy' ? 6 : 8;
    disc(cx - 24, cy - 10, er, EYE);
    disc(cx + 24, cy - 10, er, EYE);
  }
  // 鼻子
  disc(cx, cy + 6, 8, EYE);
}

const ROW_POSE = ['idle', 'walk', 'happy', 'sleep'];
for (let r = 0; r < ROWS; r++) {
  const pose = ROW_POSE[r];
  for (let c = 0; c < COLS; c++) {
    const fx = c * F, fy = r * F;
    const phase = c / (COLS - 1); // 0..1
    let ox = 0, oy = 0;
    if (pose === 'idle') oy = Math.round(-8 * Math.sin(phase * Math.PI));        // 呼吸上下
    else if (pose === 'walk') ox = Math.round(-16 + 32 * phase);                 // 左右走
    else if (pose === 'happy') oy = Math.round(-14 * Math.abs(Math.sin(phase * Math.PI))); // 跳
    else if (pose === 'sleep') oy = 22;                                          // 趴下
    drawDog(fx, fy, ox, oy, pose);
  }
}

// ---- 极简 PNG 编码（RGBA, 8bit）----
function crc32(b) {
  const t = crc32.t || (crc32.t = (() => { const a = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; a[n] = c >>> 0; } return a; })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) crc = t[(crc ^ b[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
// 原始扫描线：每行前置 filter 字节 0
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  buf.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}
const idat = zlib.deflateSync(raw);
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);

const outs = [
  path.join(__dirname, '..', 'samples', 'sample-dog-greenscreen.png'),
  path.join(__dirname, '..', 'web-demo', 'sample.png')
];
for (const out of outs) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log('wrote', out, `(${W}x${H}, ${png.length} bytes)`);
}
