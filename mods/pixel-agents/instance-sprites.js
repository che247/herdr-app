import { div } from "gpui-kit";
import { shared, setShared } from "herdr";
import { HEADS } from "./sprite-heads.js";

function colorAt(index, offset = 0) {
  const h = ((index * 0.61803398875 + offset) % 1) * 6;
  const x = 1 - Math.abs(h % 2 - 1);
  const rgb = [[1,x,0],[x,1,0],[0,1,x],[0,x,1],[x,0,1],[1,0,x]][Math.floor(h)];
  return "#" + rgb.map(c => Math.round((0.48 + c * 0.47) * 255).toString(16).padStart(2,"0")).join("");
}

export function spriteIdentity(address, created) {
  // Machine-qualified address + terminal lifetime, never provider or list position.
  const key = JSON.stringify([address, created ?? null]);
  const stored = shared("pixel.agent.sprites") ?? {};
  if (stored[key] === undefined) {
    stored[key] = Math.max(-1, ...Object.values(stored)) + 1;
    setShared("pixel.agent.sprites", stored);
  }
  const index = stored[key];
  return {index, color: colorAt(index), trim: colorAt(index, 0.21)};
}

export function drawSprite(design, size) {
  const rows = [...HEADS[design.index % HEADS.length],
    ".....AAAAAA.....", "....ABBBBBBA....", "...AABHHBBAAA...", "..ABABBBBABBA...",
    "..AAABBBBAAAA...", ".....AAAAAA.....", "....AAB..BAA....", "....AAA..AAA...."].map(r => [...r]);
  // Instance-specific chest insignia supplements the distinct head and palette.
  let bits = Math.floor(design.index / HEADS.length);
  for (let y = 9; y <= 11; y++) for (let x = 6; x <= 9; x++) {
    rows[y][x] = bits % 2 ? "W" : "B";
    bits = Math.floor(bits / 2);
  }
  const palette = {A:"#263344", B:design.color, H:design.trim, W:"#f1fcff"};
  const scale = size / 16;
  const pixels = [];
  rows.forEach((row,y) => {
    for (let x=0; x<row.length;) {
      const symbol = row[x];
      let end=x+1;
      while (end<row.length && row[end]===symbol) end++;
      if (palette[symbol]) pixels.push(div().absolute().left(x*scale).top(y*scale).w((end-x)*scale).h(scale).bg(palette[symbol]));
      x=end;
    }
  });
  return div().relative().size(size).children(pixels);
}
