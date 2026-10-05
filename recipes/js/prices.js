// Grocery price estimates: rough US national averages (2025), adjusted by region,
// overridable per item with your own store's prices (Prices screen).
import { FOODS, FOOD_BY_NAME } from "./fooddb.js";
import { isReady, readyCost } from "./ready.js";
import { parseIngredient, toGrams, parseRecipe } from "./ingredients.js";
import * as store from "./store.js";
import { officialPrice, dataVersion } from "./data.js";

// name | price | basis   (p = per package from fooddb, l = per pound, e = each)
const RAW = `
onion|1.20|l
red onion|1.50|l
green onion|1.00|p
shallot|4.00|l
garlic|0.75|p
ginger|4.00|l
potato|1.10|l
sweet potato|1.50|l
carrot|1.20|l
celery|2.50|p
bell pepper|1.30|e
jalapeno|2.50|l
poblano|2.50|l
tomato|2.00|l
cherry tomatoes|3.50|p
cucumber|1.00|e
zucchini|2.00|l
yellow squash|2.00|l
butternut squash|1.50|l
eggplant|2.00|l
broccoli|2.20|l
cauliflower|3.50|e
spinach|3.50|p
kale|2.50|p
lettuce|2.50|e
arugula|4.00|p
mixed greens|4.00|p
cabbage|1.00|l
brussels sprouts|3.50|l
asparagus|3.50|p
green beans|2.50|l
mushrooms|3.00|p
corn|0.60|e
peas|2.00|p
frozen vegetables|2.00|p
avocado|1.25|e
lemon|0.75|e
lemon juice|0.75|p
lemon zest|0.75|p
lime|0.40|e
lime juice|0.40|p
lime zest|0.40|p
orange|1.00|e
orange juice|4.50|p
apple|1.00|e
banana|0.30|e
strawberries|4.00|p
blueberries|4.00|p
raspberries|4.00|p
mango|1.25|e
pineapple|3.50|e
cilantro|1.00|p
parsley|1.50|p
basil|3.00|p
mint|2.50|p
dill|2.50|p
rosemary|2.50|p
thyme|2.50|p
sage|2.50|p
chives|2.50|p
tofu|2.50|p
tempeh|3.50|p
hummus|4.00|p
chicken breast|4.00|l
chicken thighs|3.00|l
chicken drumsticks|2.00|l
chicken wings|4.00|l
whole chicken|2.00|l
chicken|5.00|l
ground chicken|5.50|p
ground turkey|5.50|p
turkey|9.00|l
ground beef|5.50|p
steak|12.00|l
beef chuck|7.00|l
short ribs|10.00|l
pork chops|4.50|l
pork tenderloin|4.50|l
pork shoulder|3.50|l
ground pork|4.50|p
bacon|6.50|p
hot dogs|5.00|p
sausage|5.50|p
ham|6.00|l
prosciutto|6.00|p
pepperoni|4.00|p
lamb|10.00|l
salmon|11.00|l
shrimp|10.00|l
white fish|9.00|l
scallops|20.00|l
crab|25.00|l
tuna|1.50|p
eggs|3.50|p
egg whites|0.30|e
egg yolks|0.30|e
butter|5.00|p
milk|3.00|p
plant milk|4.00|p
heavy cream|4.50|p
half and half|3.00|p
sour cream|3.00|p
greek yogurt|6.50|p
yogurt|4.00|p
cream cheese|2.75|p
buttermilk|2.50|p
cheddar|3.50|p
mozzarella|3.50|p
parmesan|6.00|p
feta|4.50|p
monterey jack|3.50|p
goat cheese|4.50|p
ricotta|4.00|p
swiss cheese|5.00|p
cottage cheese|3.50|p
bread|3.50|p
burger buns|3.50|p
tortillas|3.50|p
corn tortillas|3.00|p
pita|3.50|p
english muffins|3.50|p
breadcrumbs|2.50|p
pasta|1.75|p
orzo|2.00|p
egg noodles|2.50|p
lasagna noodles|2.50|p
asian noodles|2.50|p
gnocchi|3.00|p
rice|3.00|p
brown rice|3.00|p
arborio rice|4.50|p
cooked rice|3.00|p
quinoa|4.50|p
couscous|3.00|p
oats|4.00|p
lentils|2.00|p
cornmeal|3.00|p
tortilla chips|4.50|p
flour|4.00|p
whole wheat flour|5.00|p
almond flour|9.00|p
cornstarch|2.50|p
sugar|4.00|p
brown sugar|3.00|p
powdered sugar|3.00|p
baking powder|3.50|p
baking soda|1.50|p
yeast|2.00|p
vanilla extract|7.00|p
chocolate chips|4.00|p
cocoa powder|5.00|p
shredded coconut|3.50|p
honey|6.00|p
maple syrup|9.00|p
olive oil|12.00|p
vegetable oil|6.00|p
sesame oil|5.00|p
coconut oil|7.00|p
cooking spray|0|l
soy sauce|3.50|p
fish sauce|4.00|p
oyster sauce|3.50|p
hoisin sauce|3.50|p
sriracha|4.50|p
worcestershire sauce|3.50|p
mustard|3.00|p
ketchup|3.00|p
mayonnaise|5.50|p
bbq sauce|3.00|p
teriyaki sauce|3.50|p
salsa|3.50|p
pesto|4.50|p
curry paste|4.00|p
tahini|7.00|p
peanut butter|3.50|p
jam|4.00|p
white vinegar|2.50|p
apple cider vinegar|3.50|p
red wine vinegar|3.50|p
balsamic vinegar|5.00|p
rice vinegar|3.00|p
white wine|10.00|p
red wine|10.00|p
beer|1.50|p
marinara sauce|4.00|p
diced tomatoes|1.50|p
crushed tomatoes|2.75|p
tomato sauce|1.00|p
tomato paste|1.25|p
black beans|1.25|p
kidney beans|1.25|p
chickpeas|1.50|p
white beans|1.50|p
pinto beans|1.25|p
refried beans|1.75|p
coconut milk|2.50|p
chicken broth|3.00|p
beef broth|3.00|p
vegetable broth|3.00|p
broth|3.00|p
green chiles|1.50|p
chipotle peppers in adobo|2.50|p
olives|4.00|p
capers|3.50|p
artichoke hearts|3.50|p
roasted red peppers|4.00|p
sun-dried tomatoes|5.00|p
almonds|5.00|p
walnuts|5.50|p
peanuts|5.00|p
pine nuts|9.00|p
sesame seeds|3.50|p
chia seeds|6.00|p
dried fruit|4.00|p
protein powder|35.00|p
salt|0.80|l
kosher salt|1.20|l
black pepper|25.00|l
garlic powder|4.00|p
onion powder|4.00|p
paprika|4.00|p
smoked paprika|5.00|p
chili powder|4.00|p
cayenne pepper|4.50|p
red pepper flakes|4.00|p
cumin|5.00|p
coriander|5.00|p
turmeric|5.00|p
curry powder|5.00|p
garam masala|6.00|p
cinnamon|4.00|p
nutmeg|6.00|p
ground ginger|5.00|p
oregano|4.00|p
dried basil|4.00|p
dried thyme|4.00|p
dried rosemary|4.00|p
dried parsley|3.00|p
dried dill|4.00|p
italian seasoning|4.00|p
bay leaves|5.00|p
taco seasoning|1.50|p
cajun seasoning|4.50|p
allspice|6.00|p
ground cloves|7.00|p
cardamom|9.00|p
five spice|5.00|p
mustard powder|5.00|p
fennel seeds|5.00|p
everything bagel seasoning|4.00|p
pumpkin pie spice|5.00|p
bouillon|6.00|p
water|0|l
`;

export const BASE_PRICES = Object.fromEntries(RAW.trim().split("\n").map(l => {
  const [name, price, basis] = l.split("|");
  return [name, { price: Number(price), basis }];
}));

// Rough grocery cost vs. the US average (cost-of-living grocery indexes, rounded).
// Estimates only — use "Custom" or your own item prices for accuracy.
export const REGIONS = [
  ["us", "US average", 1.00],
  ["irvine", "Irvine / Orange County, CA", 1.15],
  ["la", "Los Angeles, CA", 1.12],
  ["sd", "San Diego, CA", 1.12],
  ["sf", "San Francisco Bay Area, CA", 1.25],
  ["sac", "Sacramento, CA", 1.08],
  ["sea", "Seattle, WA", 1.15],
  ["pdx", "Portland, OR", 1.08],
  ["den", "Denver, CO", 1.05],
  ["phx", "Phoenix, AZ", 1.00],
  ["lv", "Las Vegas, NV", 1.02],
  ["slc", "Salt Lake City, UT", 1.00],
  ["dfw", "Dallas / Houston / Austin, TX", 0.96],
  ["chi", "Chicago, IL", 1.05],
  ["msp", "Minneapolis, MN", 1.02],
  ["atl", "Atlanta, GA", 0.98],
  ["mia", "Miami, FL", 1.08],
  ["nyc", "New York City, NY", 1.25],
  ["bos", "Boston, MA", 1.15],
  ["dc", "Washington, DC", 1.12],
  ["hnl", "Honolulu, HI", 1.45],
  ["anc", "Anchorage, AK", 1.30],
  ["rural", "Rural Midwest / South", 0.92],
  ["custom", "Custom…", null]
];

export function regionFactor(s = store.settings()) {
  if (s.priceRegion === "custom") return (s.priceCustomPct || 100) / 100;
  const r = REGIONS.find(x => x[0] === s.priceRegion);
  return r && r[2] ? r[2] : 1;
}

// The price entry in effect for a food: yours if set, else the regional estimate.
export function priceEntry(name) {
  const mine = store.get().prices?.[name];
  if (mine && mine.price >= 0) return { ...mine, mine: true };
  // Official U.S. average (BLS), adjusted to your region the same way as the estimates.
  const off = officialPrice(name);
  if (off) return { price: Math.round(off.price * regionFactor() * 100) / 100, basis: off.basis, mine: false, official: off.period };
  const base = BASE_PRICES[name];
  if (!base) return null;
  return { price: Math.round(base.price * regionFactor() * 100) / 100, basis: base.basis, mine: false };
}

// Grams one unit of the basis represents.
export function basisGrams(food, basis) {
  if (basis === "p") return food.pkg ? food.pkg.g : null;
  if (basis === "e") return food.gEach || null;
  if (basis === "l") return 453.592;
  return null;
}

export function basisLabel(food, basis) {
  if (basis === "p") return food.pkg ? `${food.pkg.label}${food.pkg.desc ? ` (${food.pkg.desc})` : ""}` : "package";
  if (basis === "e") return "each";
  return "lb";
}

// Dollars per gram for a food, or null if unknown.
export function perGram(food) {
  if (!food) return null;
  const e = priceEntry(food.name);
  if (!e) return null;
  const g = basisGrams(food, e.basis);
  return g ? e.price / g : null;
}

// Price of one whole package / one item, for the grocery list.
export function packagePrice(food) {
  const pg = perGram(food);
  return pg != null && food.pkg ? pg * food.pkg.g : null;
}
export function eachPrice(food) {
  const pg = perGram(food);
  return pg != null && food.gEach ? pg * food.gEach : null;
}

const cache = new Map();

/** Cost of the amounts a recipe actually uses (2 tbsp of a $12 bottle ≈ 36¢). */
export function recipeCost(recipe) {
  const s = store.settings();
  const key = `${recipe.id}:${recipe.updated || 0}:${s.priceRegion}:${s.priceCustomPct}:${store.get().pricesUpdated || 0}:${dataVersion()}:${store.foodsVersion()}`;
  if (cache.has(key)) return cache.get(key);
  if (isReady(recipe)) { const out = readyCost(recipe); cache.set(key, out); return out; }
  let total = 0, counted = 0, covered = 0;
  const rows = [];
  for (const { line, ing } of parseRecipe(recipe)) {
    if (!ing || ing.header) continue;
    if (ing.food && ing.food.kind === "X") continue;
    counted++;
    const pg = perGram(ing.food);
    const g = toGrams(ing);
    if (pg != null && g != null) { covered++; total += pg * g; rows.push({ line, food: ing.food.name, cost: pg * g }); }
    else if (ing.food && ing.qty == null) { covered++; rows.push({ line, food: ing.food.name, cost: 0 }); }
    else rows.push({ line, food: ing.food?.name || null, cost: null });
  }
  const servings = recipe.yield && recipe.yield > 0 ? recipe.yield : 4;
  const out = { total, perServing: total / servings, coverage: counted ? covered / counted : 0, rows, servings };
  cache.set(key, out);
  return out;
}

export const money = n => n == null || isNaN(n) ? "–" : n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`;

export function missingPrices() {
  return FOODS.filter(f => !BASE_PRICES[f.name]).map(f => f.name);
}
export { FOOD_BY_NAME };
