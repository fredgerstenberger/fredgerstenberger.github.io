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
  // A notepad with a red top strip and room under the last line.
  list: {
    map: [
      ".kkkkkkkkkkkkkk.",
      ".krrrrrrrrrrrrk.",
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
      ".kwwwwwwwwwwwwk.",
      ".kkkkkkkkkkkkkk."
    ],
    colors: { k: K, w: "#FFFFFF", g: "#8A94A3", b: "#2448C8", r: "#D0473A" }
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
  // Two toggle switches, one on and one off.
  settings: {
    map: [
      "..kkkkkkkkkkkk..",
      ".kgggggggkwwwwk.",
      "kgggggggkwwwwwwk",
      "kgggggggkwwwwwwk",
      ".kgggggggkwwwwk.",
      "..kkkkkkkkkkkk..",
      "................",
      "................",
      "..kkkkkkkkkkkk..",
      ".kwwwwksssssssk.",
      "kwwwwwwksssssssk",
      "kwwwwwwksssssssk",
      ".kwwwwksssssssk.",
      "..kkkkkkkkkkkk.."
    ],
    colors: { k: K, g: "#3FAE5A", w: "#FFFFFF", s: "#C9CED6" }
  },
  price: {
    map: [
      "................",
      "....kkkkkkkkkkkk",
      "...kyyyyyyyyyyyk",
      "..kyyyyyyydyyyyk",
      ".kyyyyyyyddddyyk",
      "kyyyyyyydydyyyyk",
      "kyywwyyyydddyyyk",
      "kyywwyyyyydydyyk",
      "kyyyyyyyddddyyyk",
      ".kyyyyyyyydyyyyk",
      "..kyyyyyyyyyyyyk",
      "...kyyyyyyyyyyyk",
      "....kkkkkkkkkkkk",
      "................"
    ],
    colors: { k: K, y: "#F7C948", w: K, d: "#2E7D3A" }
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

SPRITES.filter = {
  map: [
    "...cc......",
    "ccccccccccc",
    "...cc......",
    "...........",
    ".......cc..",
    "ccccccccccc",
    ".......cc..",
    "...........",
    "....cc.....",
    "ccccccccccc",
    "....cc....."
  ],
  colors: { c: "currentColor" }
};


// The interface icon set: 12 × 12 so it lands on whole device pixels at 16, 20 and 24 px on a 3× screen.
// "c" pixels take the text color; stars are gold with a darker edge (the empty star is just the edge).
const STAR = { k: "#B7791F", y: "#F7C948" };
SPRITES.chevLeft = {
  map: [
    "............",
    ".......cc...",
    "......cc....",
    ".....cc.....",
    "....cc......",
    "...cc.......",
    "...cc.......",
    "....cc......",
    ".....cc.....",
    "......cc....",
    ".......cc...",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.chevRight = {
  map: [
    "............",
    "...cc.......",
    "....cc......",
    ".....cc.....",
    "......cc....",
    ".......cc...",
    ".......cc...",
    "......cc....",
    ".....cc.....",
    "....cc......",
    "...cc.......",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.chevDown = {
  map: [
    "............",
    "............",
    "............",
    ".c........c.",
    ".cc......cc.",
    "..cc....cc..",
    "...cc..cc...",
    "....cccc....",
    ".....cc.....",
    "............",
    "............",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.chevUp = {
  map: [
    "............",
    "............",
    "............",
    ".....cc.....",
    "....cccc....",
    "...cc..cc...",
    "..cc....cc..",
    ".cc......cc.",
    ".c........c.",
    "............",
    "............",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.close = {
  map: [
    "............",
    ".cc......cc.",
    ".ccc....ccc.",
    "..ccc..ccc..",
    "...cccccc...",
    "....cccc....",
    "....cccc....",
    "...cccccc...",
    "..ccc..ccc..",
    ".ccc....ccc.",
    ".cc......cc.",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.check = {
  map: [
    "............",
    "............",
    "..........cc",
    ".........ccc",
    "........ccc.",
    ".cc....ccc..",
    ".ccc..ccc...",
    "..cccccc....",
    "...cccc.....",
    "....cc......",
    "............",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.plus = {
  map: [
    "............",
    ".....cc.....",
    ".....cc.....",
    ".....cc.....",
    ".....cc.....",
    ".cccccccccc.",
    ".cccccccccc.",
    ".....cc.....",
    ".....cc.....",
    ".....cc.....",
    ".....cc.....",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.minus = {
  map: [
    "............",
    "............",
    "............",
    "............",
    "............",
    ".cccccccccc.",
    ".cccccccccc.",
    "............",
    "............",
    "............",
    "............",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.more = {
  map: [
    "............",
    "............",
    "............",
    "............",
    "............",
    ".cc..cc..cc.",
    ".cc..cc..cc.",
    "............",
    "............",
    "............",
    "............",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.pause = {
  map: [
    "............",
    "..ccc..ccc..",
    "..ccc..ccc..",
    "..ccc..ccc..",
    "..ccc..ccc..",
    "..ccc..ccc..",
    "..ccc..ccc..",
    "..ccc..ccc..",
    "..ccc..ccc..",
    "..ccc..ccc..",
    "..ccc..ccc..",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.play = {
  map: [
    "............",
    "...c........",
    "...cc.......",
    "...ccc......",
    "...cccc.....",
    "...ccccc....",
    "...ccccc....",
    "...cccc.....",
    "...ccc......",
    "...cc.......",
    "...c........",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.edit = {
  map: [
    "............",
    ".........cc.",
    ".........cc.",
    ".......cc...",
    "......ccc...",
    ".....ccc....",
    "....ccc.....",
    "...ccc......",
    "..ccc.......",
    "..cc........",
    ".c..........",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.camera = {
  map: [
    "............",
    "...cccc.....",
    "cccccccccccc",
    "c..........c",
    "c...cccc...c",
    "c..cc..cc..c",
    "c..c....c..c",
    "c..c....c..c",
    "c..cc..cc..c",
    "c...cccc...c",
    "c..........c",
    "cccccccccccc"
  ],
  colors: { c: "currentColor" }
};
SPRITES.clipboard = {
  map: [
    "....cccc....",
    ".cccc..cccc.",
    ".c..cccc..c.",
    ".c........c.",
    ".c.cccccc.c.",
    ".c........c.",
    ".c.cccccc.c.",
    ".c........c.",
    ".c.cccc...c.",
    ".c........c.",
    ".c........c.",
    ".cccccccccc."
  ],
  colors: { c: "currentColor" }
};
SPRITES.external = {
  map: [
    "......cccccc",
    "......cccccc",
    ".........ccc",
    "cccc....cccc",
    "c......cc.cc",
    "c.....cc..cc",
    "c....cc.....",
    "c...cc......",
    "c.......c...",
    "c.......c...",
    "c.......c...",
    "ccccccccc..."
  ],
  colors: { c: "currentColor" }
};
SPRITES.swap = {
  map: [
    ".......c....",
    ".......cc...",
    "cccccccccc..",
    "ccccccccccc.",
    ".......cc...",
    ".......c....",
    "....c.......",
    "...cc.......",
    "..cccccccccc",
    ".ccccccccccc",
    "...cc.......",
    "....c......."
  ],
  colors: { c: "currentColor" }
};
SPRITES.swapVert = {
  map: [
    "..cc........",
    "..cc.....c..",
    "..cc....cc..",
    "..cc...cccc.",
    "..cc..cccccc",
    "..cc....cc..",
    "..cc....cc..",
    "cccccc..cc..",
    ".cccc...cc..",
    "..cc....cc..",
    "...c....cc..",
    "........cc.."
  ],
  colors: { c: "currentColor" }
};
SPRITES.arrowUp = {
  map: [
    "............",
    ".....cc.....",
    "....cccc....",
    "...cccccc...",
    "..cccccccc..",
    ".ccc.cc.ccc.",
    ".cc..cc..cc.",
    ".....cc.....",
    ".....cc.....",
    ".....cc.....",
    ".....cc.....",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.arrowDown = {
  map: [
    "............",
    ".....cc.....",
    ".....cc.....",
    ".....cc.....",
    ".....cc.....",
    ".cc..cc..cc.",
    ".ccc.cc.ccc.",
    "..cccccccc..",
    "...cccccc...",
    "....cccc....",
    ".....cc.....",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.grip = {
  map: [
    "............",
    "............",
    ".cccccccccc.",
    "............",
    "............",
    ".cccccccccc.",
    "............",
    "............",
    ".cccccccccc.",
    "............",
    "............",
    "............"
  ],
  colors: { c: "currentColor" }
};
SPRITES.info = {
  map: [
    "...cccccc...",
    "..c......c..",
    ".c...cc...c.",
    "c....cc....c",
    "c..........c",
    "c...ccc....c",
    "c....cc....c",
    "c....cc....c",
    "c....cc....c",
    ".c..cccc..c.",
    "..c......c..",
    "...cccccc..."
  ],
  colors: { c: "currentColor" }
};
SPRITES.timer = {
  map: [
    "....cccc....",
    ".....cc.....",
    "...cccccc.c.",
    "..c......cc.",
    ".c...cc...c.",
    ".c...cc...c.",
    "c....cc....c",
    "c....ccc...c",
    "c.....ccc..c",
    ".c........c.",
    "..c......c..",
    "...cccccc..."
  ],
  colors: { c: "currentColor" }
};
SPRITES.star = {
  map: [
    ".....kk.....",
    ".....kk.....",
    "....kyyk....",
    "kkkkkyykkkkk",
    "kyyyyyyyyyyk",
    ".kyyyyyyyyk.",
    "..kyyyyyyk..",
    "..kyyyyyyk..",
    ".kyyykkyyyk.",
    ".kyyk..kyyk.",
    "kyyk....kyyk",
    "kkk......kkk"
  ],
  colors: STAR
};
SPRITES.starHalf = {
  map: [
    ".....kk.....",
    ".....kk.....",
    "....ky.k....",
    "kkkkky.kkkkk",
    "kyyyyy.....k",
    ".kyyyy....k.",
    "..kyyy...k..",
    "..kyyy...k..",
    ".kyyykk...k.",
    ".kyyk..k..k.",
    "kyyk....k..k",
    "kkk......kkk"
  ],
  colors: STAR
};
SPRITES.starEmpty = {
  map: [
    ".....kk.....",
    ".....kk.....",
    "....k..k....",
    "kkkkk..kkkkk",
    "k..........k",
    ".k........k.",
    "..k......k..",
    "..k......k..",
    ".k...kk...k.",
    ".k..k..k..k.",
    "k..k....k..k",
    "kkk......kkk"
  ],
  colors: { k: "currentColor" }
};

/** An interface icon (sized by CSS: 1em, or the .ic16/.ic20/.ic24 classes). Decorative: the button it sits in carries the label. */
export const icon = (name, cls = "") => sprite(name, `ic ${cls}`.trim());

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
