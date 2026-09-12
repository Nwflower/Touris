/* 从原始 LOGO 派生三个尺寸，并输出 base64 data URI（内联进 CSS，file:// 下零请求）。用完即删。 */
const fs = require('fs'), zlib = require('zlib');

/* ---------- 读 PNG ---------- */
const b = fs.readFileSync('D:/Desktop/TOURIS.png');
let o = 8, W, H, idat = [];
while(o < b.length){
  const len = b.readUInt32BE(o), type = b.slice(o+4, o+8).toString('ascii');
  const data = b.slice(o+8, o+8+len);
  if(type === 'IHDR'){ W = data.readUInt32BE(0); H = data.readUInt32BE(4); }
  else if(type === 'IDAT') idat.push(data);
  else if(type === 'IEND') break;
  o += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));
const bpp = 4, stride = W * bpp;
const px = Buffer.alloc(H * stride);
let p = 0;
for(let y = 0; y < H; y++){
  const ft = raw[p++];
  for(let x = 0; x < stride; x++){
    const cur = raw[p+x];
    const a  = x >= bpp ? px[y*stride+x-bpp] : 0;
    const bb = y > 0 ? px[(y-1)*stride+x] : 0;
    const c  = (x >= bpp && y > 0) ? px[(y-1)*stride+x-bpp] : 0;
    let v;
    if(ft===0) v=cur;
    else if(ft===1) v=cur+a;
    else if(ft===2) v=cur+bb;
    else if(ft===3) v=cur+((a+bb)>>1);
    else if(ft===4){ const pa=Math.abs(bb-c),pb=Math.abs(a-c),pc=Math.abs(a+bb-2*c);
                     v=cur+((pa<=pb&&pa<=pc)?a:(pb<=pc?bb:c)); }
    else v=cur;
    px[y*stride+x] = v & 255;
  }
  p += stride;
}

/* ---------- PNG 编码 ---------- */
let T=null;
function crc32(buf){
  if(!T){ T=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; T[n]=c>>>0; } }
  let c=0xFFFFFFFF;
  for(const x of buf) c = T[(c^x)&255] ^ (c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type,'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encode(rgba, w, h){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const rows = Buffer.alloc(h*(w*4+1));
  for(let y=0;y<h;y++){
    rows[y*(w*4+1)] = 0;
    rgba.copy(rows, y*(w*4+1)+1, y*w*4, (y+1)*w*4);
  }
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows,{level:9})), chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 裁剪 + 缩放 ---------- */
function crop(x0,y0,w,h){
  const out = Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)
    px.copy(out, y*w*4, (y0+y)*stride + x0*4, (y0+y)*stride + (x0+w)*4);
  return { buf: out, w, h };
}
function scale(src, w2, h2){
  const out = Buffer.alloc(w2*h2*4);
  for(let y=0;y<h2;y++){
    const sy = Math.min(src.h-1, Math.floor((y+0.5)*src.h/h2));
    for(let x=0;x<w2;x++){
      const sx = Math.min(src.w-1, Math.floor((x+0.5)*src.w/w2));
      src.buf.copy(out, (y*w2+x)*4, (sy*src.w+sx)*4, (sy*src.w+sx)*4+4);
    }
  }
  return { buf: out, w:w2, h:h2 };
}
function composeMarkWord(mark, word, targetH){
  const k = targetH / (mark.h + 46 + word.h);
  const mw = Math.round(mark.w*k), mh = Math.round(mark.h*k);
  const ww = Math.round(word.w*k*0.92), wh = Math.round(word.h*k*0.92);
  const T2 = Math.round(46*k);
  const cnvW = Math.max(mw, ww), cnvH = mh + T2 + wh;
  const cnv = Buffer.alloc(cnvW*cnvH*4);
  const blit = (s, ox, oy) => {
    for(let y=0;y<s.h;y++)
      s.buf.copy(cnv, ((oy+y)*cnvW+ox)*4, y*s.w*4, (y+1)*s.w*4);
  };
  blit(scale(mark, mw, mh), Math.round((cnvW-mw)/2), 0);
  blit(scale(word, ww, wh), Math.round((cnvW-ww)/2), mh + T2);
  return { buf: cnv, w: cnvW, h: cnvH };
}

/* ---------- 三块：汉字标 / 英文标 / 完整组合 ---------- */
const PAD = 6;
const mark = crop(179-PAD, 55-PAD, 629+2*PAD, 312+2*PAD);
const word = crop(181-PAD, 414-PAD, 631+2*PAD, 126+2*PAD);
const lock = composeMarkWord(
  crop(179, 55, 629, 312),
  crop(181, 414, 631, 126),
  136
);

const out = {};
for(const [k, v] of Object.entries({ mark, word, lock })){
  const png = encode(v.buf, v.w, v.h);
  fs.writeFileSync(`_logo_${k}.png`, png);
  out[k] = { w:v.w, h:v.h, bytes:png.length, uri:'data:image/png;base64,' + png.toString('base64') };
}
fs.writeFileSync('_logo_uris.json', JSON.stringify(out, null, 1));
for(const [k,v] of Object.entries(out)){
  console.log(`${k.padEnd(5)} ${String(v.w).padStart(4)}x${String(v.h).padStart(4)}  ` +
              `PNG ${String(Math.round(v.bytes/1024)).padStart(3)}KB  ` +
              `base64 ${String(Math.round(v.uri.length/1024)).padStart(3)}KB  ` +
              `比例 ${(v.w/v.h).toFixed(2)}`);
}
