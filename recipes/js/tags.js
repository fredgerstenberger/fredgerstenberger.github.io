// Automatic keywords from the title, ingredients and the site's own categories.
import { parseIngredient, parseRecipe } from "./ingredients.js";

// tag → regex tested against "title + site keywords" (T) or ingredient food names/lines (I)
const RULES = [
  // meals
  ["breakfast", /\b(breakfast|brunch|pancakes?|waffles?|french toast|omelets?|omelettes?|frittata|granola|oatmeal|overnight oats|scrambled|muffins?|smoothie|breakfast burrito|hash browns?|shakshuka)\b/, "T"],
  ["lunch", /\b(lunch|sandwich(es)?|wraps?|salads?|bowls?|paninis?|quesadillas?|soup)\b/, "T"],
  ["dinner", /\b(dinner|main course|main dish|mains?|entr[eé]es?|supper|weeknight)\b/, "T"],
  ["dessert", /\b(dessert|cookies?|cakes?|brownies?|pies?|tarts?|cupcakes?|pudding|ice cream|cheesecake|cobbler|crisp|fudge|blondies?)\b/, "T"],
  ["snack", /\b(snacks?|appetizers?|dips?|bites|hummus|guacamole|energy balls?)\b/, "T"],
  ["side", /\b(side dish|sides?)\b/, "T"],
  // dish types
  ["pasta", /\b(pasta|spaghetti|penne|rigatoni|fettuccine|linguine|lasagna|mac and cheese|macaroni|ziti|orzo|gnocchi|noodles?|ravioli|tortellini|carbonara|bolognese|alfredo)\b/, "T"],
  ["soup", /\b(soup|stew|chili|chowder|bisque|pho|ramen|gumbo|broth)\b/, "T"],
  ["salad", /\b(salad|slaw)\b/, "T"],
  ["tacos", /\b(tacos?|burritos?|enchiladas?|fajitas?|quesadillas?|nachos)\b/, "T"],
  ["bowl", /\b(bowls?)\b/, "T"],
  ["sandwich", /\b(sandwich(es)?|burgers?|sliders?|wraps?|paninis?|subs?)\b/, "T"],
  ["pizza", /\b(pizza|flatbread|calzone)\b/, "T"],
  ["stir fry", /\b(stir[- ]?fry|fried rice|lo mein|teriyaki)\b/, "T"],
  ["curry", /\b(curry|tikka|masala|korma|vindaloo)\b/, "T"],
  ["casserole", /\b(casserole|bake|baked ziti|gratin)\b/, "T"],
  ["baking", /\b(bread|muffins?|cookies?|cakes?|scones?|biscuits?|rolls|loaf)\b/, "T"],
  // methods
  ["one pot", /\b(one[- ]pot|one[- ]pan|skillet)\b/, "T"],
  ["sheet pan", /\b(sheet[- ]pan|traybake)\b/, "T"],
  ["slow cooker", /\b(slow cooker|crock ?pot|crockpot)\b/, "T"],
  ["instant pot", /\b(instant pot|pressure cooker)\b/, "T"],
  ["air fryer", /\b(air fryer|air[- ]fried)\b/, "T"],
  ["grill", /\b(grill(ed)?|bbq|barbecue|kebabs?|skewers?)\b/, "T"],
  ["meal prep", /\b(meal prep|make[- ]ahead|freezer)\b/, "T"],
  // cuisines
  ["italian", /\b(italian|parmesan|parmigiana|risotto|marinara|pesto|bolognese|carbonara|caprese|tuscan)\b/, "T"],
  ["mexican", /\b(mexican|tacos?|burritos?|enchiladas?|fajitas?|salsa|carnitas|tex[- ]mex|quesadillas?|elote)\b/, "T"],
  ["asian", /\b(asian|chinese|japanese|korean|thai|vietnamese|teriyaki|stir[- ]?fry|lo mein|pad thai|pho|ramen|bibimbap|bulgogi|kung pao|orange chicken|sesame)\b/, "T"],
  ["indian", /\b(indian|tikka|masala|curry|dal|dahl|korma|biryani|tandoori|naan|chana)\b/, "T"],
  ["mediterranean", /\b(mediterranean|greek|gyros?|souvlaki|tzatziki|falafel|shawarma|hummus|middle eastern|lebanese)\b/, "T"],
  ["american", /\b(american|burgers?|bbq|mac and cheese|meatloaf|pot roast|southern|cajun)\b/, "T"],
];

const PROTEINS = [
  ["chicken", /^(chicken|chicken breast|chicken thighs|chicken drumsticks|chicken wings|whole chicken|ground chicken)$/],
  ["beef", /^(ground beef|steak|beef chuck|short ribs)$/],
  ["pork", /^(pork chops|pork tenderloin|pork shoulder|ground pork|bacon|sausage|ham|prosciutto|pepperoni)$/],
  ["turkey", /^(ground turkey|turkey)$/],
  ["lamb", /^lamb$/],
  ["salmon", /^salmon$/],
  ["shrimp", /^shrimp$/],
  ["fish", /^(salmon|white fish|tuna)$/],
  ["seafood", /^(shrimp|scallops|crab)$/],
  ["tofu", /^(tofu|tempeh)$/],
  ["beans", /^(black beans|kidney beans|chickpeas|white beans|pinto beans|refried beans|lentils)$/],
  ["eggs", /^eggs$/],
  ["rice", /^(rice|brown rice|arborio rice|cooked rice)$/],
  ["pasta", /^(pasta|orzo|egg noodles|lasagna noodles|gnocchi)$/],
  ["noodles", /^asian noodles$/],
  ["potatoes", /^(potato|sweet potato)$/],
];

const MEAT = /^(chicken|chicken breast|chicken thighs|chicken drumsticks|chicken wings|whole chicken|ground chicken|ground turkey|turkey|ground beef|steak|beef chuck|short ribs|pork chops|pork tenderloin|pork shoulder|ground pork|bacon|sausage|ham|prosciutto|pepperoni|lamb|chicken broth|beef broth|bouillon)$/;
const FISH = /^(salmon|shrimp|white fish|scallops|crab|tuna|fish sauce)$/;

export function autoTags(r) {
  const tags = new Set();
  const title = (r.title || "").toLowerCase();
  const T = `${title} ${(r.siteKeywords || []).join(" ")}`;
  for (const [tag, re, where] of RULES) if (where === "T" && re.test(T)) tags.add(tag);

  const foods = new Set();
  for (const { line, ing } of parseRecipe(r)) {
    if (ing && ing.food) foods.add(ing.food.name);
  }
  const counts = {};
  for (const f of foods) for (const [tag, re] of PROTEINS) if (re.test(f)) counts[tag] = (counts[tag] || 0) + 1;
  for (const tag of Object.keys(counts)) {
    // Eggs/beans/rice only count as a headline ingredient when named in the title.
    if (["eggs", "beans", "rice", "potatoes"].includes(tag) && !new RegExp(`\\b${tag.replace(/s$/, "")}`).test(title)) continue;
    tags.add(tag);
  }

  const hasMeat = [...foods].some(f => MEAT.test(f));
  const hasFish = [...foods].some(f => FISH.test(f));
  if (!hasMeat && !hasFish && foods.size >= 3) tags.add("vegetarian");
  if (!hasMeat && hasFish) tags.add("pescatarian");

  // A main-ingredient recipe with no meal tag is most likely dinner.
  if (!["breakfast", "lunch", "dinner", "dessert", "snack", "side"].some(t => tags.has(t)) && (hasMeat || hasFish || tags.has("pasta") || tags.has("tofu"))) {
    tags.add("dinner");
  }
  return [...tags];
}

export const MEAL_TAGS = ["breakfast", "lunch", "dinner", "dessert", "snack", "side"];
