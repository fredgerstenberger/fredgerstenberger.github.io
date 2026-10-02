// Small 8×8 pixel icons for grocery aisles and list chrome (Calm Pixel style accents).
// Each icon is rows of palette letters; "." is transparent. "currentColor" follows the text color.
const ICONS = {
  produce:    { p: ["...gg...", "....g...", ".rrrrrr.", "rrrrrrrr", "rrrrrrwr", "rrrrrrrr", ".rrrrrr.", "..rrrr.."], c: { g: "#3E9E55", r: "#E0503C", w: "#FFB4A8" } },
  meat:       { p: [".rrr....", "rllrr...", "rlrrrr..", "rrrrrrd.", ".rrrrdk.", "..rddwk.", "....kwwk", ".....kk."], c: { r: "#D98A3D", l: "#F2B866", d: "#A85E24", w: "#F3E7D3", k: "#B9A07A" } }, // chicken drumstick
  seafood:    { p: ["........", "...bb...", "..bbbb.b", ".bwbbbbb", ".bbbbbbb", "..bbbb.b", "...bb...", "........"], c: { b: "#4A90C2", w: "#FFFFFF" } },
  dairy:      { p: ["..bbbb..", ".bwwwwb.", "bwwwwwwb", "bwbbbbwb", "bwbbbbwb", "bwwwwwwb", "bwwwwwwb", "bbbbbbbb"], c: { b: "#3B6FD8", w: "#FFFFFF" } },
  bakery:     { p: ["..yyyy..", ".yyyyyy.", "yyyyyyyy", "ylylylyy", "yyyyyyyy", "yyyyyyyy", ".yyyyyy.", "........"], c: { y: "#C98A3E", l: "#F0C27E" } },
  dry:        { p: ["..kkkk..", "...kk...", "..wwww..", ".wwwwww.", "wwwyywww", "wwyyyyww", "wwwwwwww", ".wwwwww."], c: { k: "#8C6A43", w: "#E8D6B3", y: "#D9A520" } },
  canned:     { p: [".yyyyyy.", "yyyyyyyy", "kkkkkkkk", "kwwwwwwk", "kwrrrrwk", "kwwwwwwk", "kkkkkkkk", ".yyyyyy."], c: { y: "#D9A520", k: "#C0392B", w: "#FFF6E0", r: "#7A1F12" } },
  baking:     { p: [".....k..", "....k...", "...k....", "bbbbbbbb", "bwwwwwwb", ".bwwwwb.", "..bbbb..", "........"], c: { k: "#9AA7B4", b: "#6C8EBF", w: "#F4F7FB" } },
  condiments: { p: ["...kk...", "...rr...", "..rrrr..", ".rrrrrr.", ".rwwwwr.", ".rwwwwr.", ".rrrrrr.", ".rrrrrr."], c: { k: "#4A4F57", r: "#E0503C", w: "#FFE9A8" } },
  spices:     { p: ["..kkkk..", ".kkkkkk.", ".gggggg.", ".gwwwwg.", ".gwwwwg.", ".gggggg.", ".gggggg.", "........"], c: { k: "#9AA7B4", g: "#7A9E3E", w: "#F1F5E6" } },
  snacks:     { p: ["r.r.r.r.", "rrrrrrrr", ".yyyyyy.", ".yywwyy.", ".ywwwwy.", ".yywwyy.", "rrrrrrrr", ".r.r.r.r"], c: { r: "#D2462E", y: "#F2C14E", w: "#FFF3C4" } }, // crimped bag of chips
  drinks:     { p: ["...kk...", "...oo...", "..obbo..", ".obbbbo.", ".orrrro.", ".orwwro.", ".obbbbo.", "..oooo.."], c: { k: "#2E6FA8", o: "#5E9FCB", b: "#9FD6F2", r: "#E0503C", w: "#FFFFFF" } }, // bottle
  frozen:     { p: ["...c....", ".c.c.c..", "..ccc...", "ccccccc.", "..ccc...", ".c.c.c..", "...c....", "........"], c: { c: "#5BB6E8" } },
  other:      { p: ["........", ".kkkkkk.", "kyyyyyyk", "kyyyyyyk", "kkkkkkkk", "kyyyyyyk", "kyyyyyyk", ".kkkkkk."], c: { k: "#9C7A4F", y: "#D7B07A" } },
  home:       { p: ["..wwww..", ".wwwwww.", "wwwkkwww", "wwk..kww", "wwk..kww", "wwwkkwww", ".wwwwww.", "..wwww.."], c: { w: "#E3E9EF", k: "#8E9BA8" } },
  cart:       { p: ["k.......", ".kkkkkkk", ".kyyyyyk", ".kyyyyk.", ".kkkkkk.", ".k......", "..k..k..", "..k..k.."], c: { k: "currentColor", y: "#F2C14E" } },
  check:      { p: ["........", ".......w", "......ww", "w....ww.", "ww..ww..", ".wwww...", "..ww....", "........"], c: { w: "currentColor" } }
};

const cache = new Map();
export function pix(name, size = 16, cls = "") {
  const key = name + size + cls;
  if (cache.has(key)) return cache.get(key);
  const ic = ICONS[name] || ICONS.other;
  let r = "";
  ic.p.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${ic.c[ch]}"/>`; }));
  const svg = `<svg class="pix ${cls}" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  cache.set(key, svg);
  return svg;
}
