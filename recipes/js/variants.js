// Product variants: words that make a different product of the same food. "Protein pasta", "chickpea
// pasta" and "Barilla Protein+ penne" are all pasta for the aisle and price, but not for nutrition;
// oat and almond milk are both plant milk, but not the same thing to buy.
// Used by the grocery add box (which lines are the same item) and by nutrition (which ingredients get their
// own info, with the base food's numbers as a stand-in until you add a label).

const singular = w => {
  if (/(ss|us|is)$/.test(w) || w.length <= 3) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
};
export const words = t => String(t || "").toLowerCase().split(/[^a-z0-9%\-]+/).filter(Boolean);

// Words that change the nutrition enough that the base food's numbers are only a stand-in.
const NUTRITION = ("whole skim nonfat non-fat fat-free low-fat lowfat reduced-fat full-fat part-skim lactose-free " +
  "oat almond soy coconut cashew rice pea hemp macadamia goat " +
  "protein high-protein chickpea lentil bean edamame keto low-carb carb-smart sugar-free no-sugar-added " +
  "unsweetened sweetened light lite diet zero wheat multigrain gluten-free cauliflower veggie").split(" ");
// Words that only matter for what to buy (a red or green pepper is about the same food).
const SHOPPING = ("vanilla chocolate strawberry salted unsalted dark low-sodium reduced-sodium no-salt " +
  "red green yellow orange white black brown purple golden greek decaf caffeine-free").split(" ");
const NUTRITION_SET = new Set(NUTRITION), VARIETY = new Set([...NUTRITION, ...SHOPPING]);
const isPercent = w => /^\d+(\.\d+)?%$/.test(w);

// Common brands, so "Barilla protein penne" and "Banza penne" are their own products.
export const BRANDS = ["barilla", "banza", "ronzoni", "de cecco", "rao's", "fairlife", "chobani", "fage", "oikos", "siggi's",
  "silk", "oatly", "califia", "planet oat", "kerrygold", "philadelphia", "daiya", "beyond", "impossible", "kodiak", "quest",
  "premier", "dave's killer", "ezekiel", "mission", "old el paso", "kraft", "heinz", "hellmann's", "trader joe's", "kirkland",
  "great value", "good & gather", "simple truth", "bob's red mill", "king arthur", "halo top", "ben & jerry's", "sargento",
  "tillamook", "cabot", "boar's head", "oscar mayer", "applegate", "hormel", "jennie-o", "perdue", "tyson", "annie's",
  "amy's", "rxbar", "clif", "nature valley", "cheerios", "kellogg's", "quaker", "ragu", "prego", "bertolli",
  "la banderita", "tostitos", "lay's", "carbonaut", "thomas'", "pepperidge farm", "lesser evil"];
const brandRes = BRANDS.map(b => [b, new RegExp(`(^|[^a-z])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`)]);
export const brandsIn = text => {
  const t = String(text || "").toLowerCase().replace(/[’]/g, "'");
  return brandRes.filter(([, re]) => re.test(t)).map(([b]) => b);
};

// What a food is when nothing else is said: green peas are peas, white sugar is sugar.
const DEFAULT_VARIETY = { onion: "yellow", peas: "green", sugar: "white", rice: "white", "cooked rice": "white", mushrooms: "white",
  cornmeal: "yellow", "kidney beans": "red", almonds: "whole" };

function own(food) {
  return new Set([...words(food?.name), DEFAULT_VARIETY[food?.name]].filter(Boolean).map(singular));
}
function brandWords(brands) { return new Set(brands.flatMap(words).map(singular)); }

/**
 * Variety words in a name that aren't part of the food's own name or its default, brands included:
 * "2% milk" → ["2%"], "Barilla Protein+ penne" → ["barilla", "protein"]. Sorted, for stable keys.
 */
export function varietyOf(name, food) {
  const mine = own(food), brands = brandsIn(name), bw = brandWords(brands);
  const ws = words(name).map(singular).filter(w => !mine.has(w) && !bw.has(w) && (VARIETY.has(w) || isPercent(w)));
  return [...new Set([...brands, ...ws])].sort();
}

/**
 * The ingredient's own nutrition key when it's a specific product of a table food: brands first, then the
 * nutrition words as written, then the food ("barilla protein pasta", "chickpea pasta", "whole wheat pasta",
 * "skim milk", "almond plant milk"). null when it's just the food (colors, flavors and prep words don't count).
 */
export function nutritionVariant(name, food) {
  if (!food) return null;
  const mine = own(food), brands = brandsIn(name), bw = brandWords(brands);
  // In the order they're written ("whole wheat pasta"), brands first.
  const ws = [...new Set(words(name).map(singular).filter(w => !mine.has(w) && !bw.has(w) && (NUTRITION_SET.has(w) || isPercent(w))))];
  if (!brands.length && !ws.length) return null;
  return { words: [...brands, ...ws], key: `${[...brands, ...ws].join(" ")} ${food.name}` };
}
