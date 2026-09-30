// 16×14 pixel sprites, same technique as the portfolio's folder icons.
const K = "#1A2230";

export const SPRITES = {
  book: {
    map: [
      "...kkkkkkkkkkkk.",
      "..kdrrrrrrrrrrrk",
      "..kdrrrrrrrrrrrk",
      "..kdrrkkkkkkrrrk",
      "..kdrrkyyyykrrrk",
      "..kdrrkkkkkkrrrk",
      "..kdrrrrrrrrrrrk",
      "..kdrrrrrrrrrrrk",
      "..kdrrrrrrrrrrrk",
      "..kdrrrrrrrrrrrk",
      "..kdkkkkkkkkkkkk",
      "..kdwwwwwwwwwwwk",
      "..kdwwwwwwwwwwwk",
      "...kkkkkkkkkkkk."
    ],
    colors: { k: K, r: "#D0473A", d: "#8E2A22", y: "#F7C948", w: "#FFFFFF" }
  },
  add: {
    map: [
      ".kkkkkkkkkkkk...",
      ".kwwwwwwwwwwkk..",
      ".kwwwwwwwwwwkwk.",
      ".kwwwwwwwwwwkkkk",
      ".kwwwwwggwwwwwwk",
      ".kwwwwwggwwwwwwk",
      ".kwwwggggggwwwwk",
      ".kwwwggggggwwwwk",
      ".kwwwwwggwwwwwwk",
      ".kwwwwwggwwwwwwk",
      ".kwwwwwwwwwwwwwk",
      ".kwwwwwwwwwwwwwk",
      ".kwwwwwwwwwwwwwk",
      ".kkkkkkkkkkkkkkk"
    ],
    colors: { k: K, w: "#FFFFFF", g: "#3FA34D" }
  },
  plan: {
    map: [
      "...kk......kk...",
      "kkkkkkkkkkkkkkkk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "kkkkkkkkkkkkkkkk",
      "kwwwwwwwwwwwwwwk",
      "kwggwggwggwggwwk",
      "kwwwwwwwwwwwwwwk",
      "kwggwggwbbwggwwk",
      "kwwwwwwwbbwwwwwk",
      "kwggwggwwwwggwwk",
      "kwwwwwwwwwwwwwwk",
      "kwwwwwwwwwwwwwwk",
      "kkkkkkkkkkkkkkkk"
    ],
    colors: { k: K, r: "#D0473A", w: "#FFFFFF", g: "#8A94A3", b: "#2448C8" }
  },
  list: {
    map: [
      ".kkkkkkkkkkkkkk.",
      ".kwwwwwwwwwwwwk.",
      ".kwkkkwwwwwwwwk.",
      ".kwkbkwggggggwk.",
      ".kwkkkwwwwwwwwk.",
      ".kwwwwwwwwwwwwk.",
      ".kwkkkwwwwwwwwk.",
      ".kwkwkwggggggwk.",
      ".kwkkkwwwwwwwwk.",
      ".kwwwwwwwwwwwwk.",
      ".kwkkkwwwwwwwwk.",
      ".kwkwkwggggwwwk.",
      ".kwkkkwwwwwwwwk.",
      ".kkkkkkkkkkkkkk."
    ],
    colors: { k: K, w: "#FFFFFF", g: "#8A94A3", b: "#2448C8" }
  },
  pantry: {
    map: [
      "....kkkkkkkk....",
      "....krrrrrrk....",
      "....kkkkkkkk....",
      "...kwwwwwwwwk...",
      "..kwwwwwwwwwwk..",
      "..kwoooooooowk..",
      "..kwyyyyyyyywk..",
      "..kwykkkkkkywk..",
      "..kwyyyyyyyywk..",
      "..kwoooooooowk..",
      "..kwoooooooowk..",
      "..kwoooooooowk..",
      "...kwwwwwwwwk...",
      "....kkkkkkkk...."
    ],
    colors: { k: K, r: "#D0473A", w: "#E8F1F8", o: "#D9901A", y: "#FFE9A3" }
  },
  convert: {
    map: [
      "................",
      ".kkkkkkkkkkk....",
      ".kwwwwwwwwwkkkk.",
      ".kwkkwwwwwwk..k.",
      ".kwwwwwwwwwk..k.",
      ".kwkwwwwwwwk..k.",
      ".kbbbbbbbbbk..k.",
      ".kbkkbbbbbbkkkk.",
      ".kbbbbbbbbbk....",
      ".kbkbbbbbbbk....",
      ".kbbbbbbbbbk....",
      ".kbbbbbbbbbk....",
      "..kkkkkkkkk.....",
      "................"
    ],
    colors: { k: K, w: "#FFFFFF", b: "#6FA8DC" }
  },
  settings: {
    map: [
      "......kkkk......",
      ".kkkk.kssk.kkkk.",
      ".kssk.kssk.kssk.",
      ".kssskssssksssk.",
      ".kksssssssssskk.",
      "...kssskksssk...",
      "kkksssk..kssskkk",
      "kssssk....kssssk",
      "kssssk....kssssk",
      "kkksssk..kssskkk",
      "...kssskksssk...",
      ".kksssssssssskk.",
      ".kssskssssksssk.",
      ".kssk.kssk.kssk.",
      ".kkkk.kssk.kkkk.",
      "......kkkk......"
    ],
    colors: { k: K, s: "#C9CED6" }
  },
  star: {
    map: [
      ".......kk.......",
      "......kyyk......",
      "......kyyk......",
      ".....kyyyyk.....",
      "kkkkkkyyyykkkkkk",
      "kyyyyyyyyyyyyyyk",
      ".kyyyyyyyyyyyyk.",
      "..kyyyyyyyyyyk..",
      "...kyyyyyyyyk...",
      "...kyyyyyyyyk...",
      "..kyyyykkyyyyk..",
      "..kyyykk.kyyyk..",
      ".kyykk....kkyyk.",
      ".kkk........kkk."
    ],
    colors: { k: K, y: "#F7C948" }
  }
};

// Small UI glyphs: "c" pixels take the current text color.
SPRITES.back = {
  map: [
    "....c......",
    "...cc......",
    "..ccc......",
    ".cccccccccc",
    "ccccccccccc",
    ".cccccccccc",
    "..ccc......",
    "...cc......",
    "....c......"
  ],
  colors: { c: "currentColor" }
};
SPRITES.close = {
  map: [
    "cc.....cc",
    "ccc...ccc",
    ".ccc.ccc.",
    "..ccccc..",
    "...ccc...",
    "..ccccc..",
    ".ccc.ccc.",
    "ccc...ccc",
    "cc.....cc"
  ],
  colors: { c: "currentColor" }
};
SPRITES.clock = {
  map: [
    "....cccc....",
    ".....cc.....",
    "...cccccc...",
    "..c......c..",
    ".c...c....c.",
    ".c...c....c.",
    ".c...ccc..c.",
    ".c........c.",
    ".c........c.",
    "..c......c..",
    "...cccccc..."
  ],
  colors: { c: "currentColor" }
};

export function sprite(name, cls = "") {
  const { map, colors } = SPRITES[name];
  const w = map[0].length, h = map.length;
  let rects = "";
  map.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const c = row[x];
      let run = 1;
      while (x + run < w && row[x + run] === c) run++;
      if (colors[c]) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${colors[c]}"/>`;
      x += run;
    }
  });
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
