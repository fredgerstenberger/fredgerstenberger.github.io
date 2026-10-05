// Ingredient reference table.
// Nutrition is per 100 g (raw/as-purchased), approximated from USDA FoodData Central.
//
// name | aliases | aisle | kind | kcal,protein,carbs,fat,fiber | g per cup | g each | package | flags
//   kind:    F = fresh/regular (always goes on the grocery list)
//            P = pantry/specialty (ask once "do you have it?", remember the answer)
//            S = staple (assumed on hand; can be changed in Pantry)
//            X = ignore (water)
//   package: label:grams[:description]   → grocery list rounds up to whole packages
//   flags:   L = liquid (metric mode shows ml instead of grams)

const RAW = `
onion|onions,yellow onion,white onion,sweet onion,brown onion|produce|F|40,1.1,9.3,0.1,1.7|160|150||
red onion|red onions|produce|F|40,1.1,9.3,0.1,1.7|160|150||
green onion|green onions,scallion,scallions,spring onion,spring onions|produce|F|32,1.8,7.3,0.2,2.6|100|15|bunch:100|
shallot|shallots|produce|F|72,2.5,17,0.1,3.2|160|40||
garlic|garlic clove,garlic cloves,cloves garlic,clove garlic,minced garlic|produce|F|149,6.4,33,0.5,2.1|136|5|head:50|
ginger|fresh ginger,ginger root,grated ginger|produce|F|80,1.8,18,0.8,2|96|15||
potato|potatoes,russet potato,russet potatoes,yukon gold potatoes,yukon gold,red potatoes,baby potatoes,gold potatoes|produce|F|77,2,17,0.1,2.2|150|213||
sweet potato|sweet potatoes,yam,yams|produce|F|86,1.6,20,0.1,3|133|130||
carrot|carrots,baby carrots|produce|F|41,0.9,9.6,0.2,2.8|128|61||
celery|celery stalk,celery stalks,celery ribs,celery rib|produce|F|16,0.7,3,0.2,1.6|101|40|bunch:450|
bell pepper|bell peppers,red bell pepper,green bell pepper,yellow bell pepper,orange bell pepper,red pepper,green pepper,sweet pepper|produce|F|26,1,6,0.3,2.1|149|120||
jalapeno|jalapeño,jalapenos,jalapeños,jalapeno pepper,serrano pepper,serrano|produce|F|29,0.9,6.5,0.4,2.8|90|14||
poblano|poblano pepper,poblano peppers,anaheim pepper|produce|F|20,0.9,4.6,0.2,1.7|90|120||
tomato|tomatoes,roma tomato,roma tomatoes,plum tomatoes,plum tomato,beefsteak tomato,vine tomatoes|produce|F|18,0.9,3.9,0.2,1.2|180|123||
cherry tomatoes|cherry tomato,grape tomatoes,grape tomato|produce|F|18,0.9,3.9,0.2,1.2|149|17|pint:300:10 oz|
cucumber|cucumbers,english cucumber,persian cucumber,persian cucumbers|produce|F|15,0.7,3.6,0.1,0.5|119|300||
zucchini|zucchinis,courgette,courgettes|produce|F|17,1.2,3.1,0.3,1|124|200||
yellow squash|summer squash|produce|F|16,1.2,3.4,0.2,1.1|113|200||
butternut squash|acorn squash,winter squash,pumpkin|produce|F|45,1,12,0.1,2|140|1000||
eggplant|aubergine,eggplants|produce|F|25,1,6,0.2,3|82|450||
broccoli|broccoli florets,broccolini|produce|F|34,2.8,6.6,0.4,2.6|91|300||
cauliflower|cauliflower florets|produce|F|25,1.9,5,0.3,2|107|575||
spinach|baby spinach,fresh spinach|produce|F|23,2.9,3.6,0.4,2.2|30||bag:142:5 oz|
kale|lacinato kale,tuscan kale,curly kale|produce|F|49,4.3,8.8,0.9,3.6|67||bunch:200|
lettuce|romaine,romaine lettuce,romaine hearts,iceberg lettuce,butter lettuce,little gem|produce|F|17,1.2,3.3,0.3,2.1|47|500||
arugula|rocket,baby arugula|produce|F|25,2.6,3.7,0.7,1.6|20||bag:142:5 oz|
mixed greens|salad greens,spring mix,mesclun|produce|F|20,1.5,3.5,0.3,2|30||bag:142:5 oz|
cabbage|green cabbage,red cabbage,napa cabbage,coleslaw mix|produce|F|25,1.3,5.8,0.1,2.5|89|900||
brussels sprouts|brussels sprout,brussel sprouts|produce|F|43,3.4,9,0.3,3.8|88|19||
asparagus|asparagus spears|produce|F|20,2.2,3.9,0.1,2.1|134|16|bunch:450|
green beans|string beans,haricots verts,snap peas,snow peas,sugar snap peas|produce|F|31,1.8,7,0.2,2.7|110|||
mushrooms|mushroom,cremini mushrooms,button mushrooms,white mushrooms,baby bella mushrooms,shiitake mushrooms,portobello mushrooms,cremini|produce|F|22,3.1,3.3,0.3,1|70|18|package:227:8 oz|
corn|corn kernels,sweet corn,ears of corn,ear of corn,corn on the cob,frozen corn|produce|F|86,3.3,19,1.4,2|145|100||
peas|green peas,frozen peas|frozen|F|81,5.4,14,0.4,5.7|145||bag:340:12 oz|
frozen vegetables|mixed vegetables,frozen mixed vegetables,stir fry vegetables|frozen|F|65,3,13,0.5,4|135||bag:340:12 oz|
ice cream|vanilla ice cream,chocolate ice cream,~gelato,~frozen yogurt,ice-cream|frozen|F|207,3.5,24,11,0.7|132||carton:1420:1.5 qt|
frozen pizza|frozen pizzas|frozen|F|266,11,33,10,2.3|||box:450:16 oz|
frozen meals|frozen meal,frozen dinner,frozen dinners,tv dinner,tv dinners,frozen entree,frozen entrees|frozen|F|130,6,15,5,2|||box:300:10 oz|
chicken nuggets|nuggets,chicken nugget,frozen chicken nuggets|frozen|F|296,15,16,19,1|||bag:822:29 oz|
orange chicken|frozen orange chicken|frozen|F|240,11,22,12,0.5|||bag:907:32 oz|
egg rolls|egg roll,frozen egg rolls|frozen|F|222,6,26,10,2|||box:300:6 rolls|
egg roll wrappers|wonton wrappers,dumpling wrappers,spring roll wrappers,gyoza wrappers|produce|F|291,9.8,58,1.5,1.8|||package:340:12 oz|
french fries|fries,frozen fries,~tater tots,frozen french fries|frozen|F|150,2.5,24,5,2.5|||bag:907:32 oz|
garlic bread|garlic toast,~texas toast,frozen garlic bread|frozen|F|350,8,40,17,2|||loaf:454:16 oz|
avocado|avocados|produce|F|160,2,8.5,14.7,6.7|150|150||
lemon|lemons|produce|F|29,1.1,9.3,0.3,2.8||85||
lemon juice|fresh lemon juice,juice of lemon|produce|F|22,0.4,6.9,0.2,0.3|244||lemon:45|L
lemon zest|zest of lemon,grated lemon zest|produce|F|47,1.5,16,0.3,10.6|96||lemon:6|
lime|limes|produce|F|30,0.7,10.5,0.2,2.8||67||
lime juice|fresh lime juice,juice of lime|produce|F|25,0.4,8.4,0.1,0.4|246||lime:30|L
lime zest|zest of lime|produce|F|47,1.5,16,0.3,10.6|96||lime:4|
orange|oranges|produce|F|47,0.9,12,0.1,2.4|180|130||
orange juice|fresh orange juice|drinks|F|45,0.7,10.4,0.2,0.2|248||carton:1500:52 fl oz|L
apple juice|apple cider drink|drinks|F|46,0.1,11,0.1,0.2|248||bottle:1890:64 fl oz|L
juice|fruit juice,~cranberry juice,~grape juice,~pineapple juice,juice boxes|drinks|F|50,0.2,12,0.1,0.2|248||bottle:1890:64 fl oz|L
seltzer|sparkling water,~club soda,soda water,seltzer water,~mineral water,~la croix|drinks|F|0,0,0,0,0|236||pack:2840:8 cans|L
coconut water|coconut waters|drinks|F|19,0.7,3.7,0.2,1.1|240||carton:1000:33.8 fl oz|L
soda|soft drink,soft drinks,~cola,~coke,~sprite,~ginger ale,~root beer|drinks|F|41,0,10.6,0,0|248||pack:4260:12 cans|L
apple|apples,granny smith apple,honeycrisp apple|produce|F|52,0.3,14,0.2,2.4|125|180||
applesauce|apple sauce,unsweetened applesauce|canned|F|68,0.2,17,0.2,1.2|255||jar:680:24 oz|
banana|bananas|produce|F|89,1.1,23,0.3,2.6|150|118||
strawberries|strawberry|produce|F|32,0.7,7.7,0.3,2|152|12|container:454:1 lb|
blueberries|blueberry|produce|F|57,0.7,14.5,0.3,2.4|148||container:170:6 oz|
raspberries|raspberry,blackberries|produce|F|52,1.2,12,0.7,6.5|123||container:170:6 oz|
mango|mangoes,mangos|produce|F|60,0.8,15,0.4,1.6|165|200||
pineapple|pineapple chunks|produce|F|50,0.5,13,0.1,1.4|165|900||
cilantro|fresh cilantro,coriander leaves,cilantro leaves|produce|F|23,2.1,3.7,0.5,2.8|16||bunch:60|
parsley|fresh parsley,flat-leaf parsley,flat leaf parsley,italian parsley,curly parsley|produce|F|36,3,6.3,0.8,3.3|60||bunch:60|
basil|fresh basil,basil leaves,thai basil|produce|F|23,3.2,2.7,0.6,1.6|21|0.5|bunch:30|
mint|fresh mint,mint leaves|produce|F|70,3.8,15,0.9,8|23||bunch:30|
dill|fresh dill|produce|F|43,3.5,7,1.1,2.1|9||bunch:30|
rosemary|fresh rosemary,rosemary sprigs,sprigs rosemary|produce|F|131,3.3,21,5.9,14|30|1|package:20:0.75 oz|
thyme|fresh thyme,thyme sprigs,sprigs thyme|produce|F|101,5.6,24,1.7,14|35|0.5|package:20:0.75 oz|
sage|fresh sage,sage leaves|produce|F|315,10.6,61,12.8,40|20|0.5|package:20:0.75 oz|
chives|fresh chives|produce|F|30,3.3,4.4,0.7,2.5|48||package:20:0.75 oz|
tofu|firm tofu,extra-firm tofu,extra firm tofu,silken tofu|produce|F|83,10,1.9,4.8,0.9|250||block:397:14 oz|
tempeh||produce|F|192,20,7.6,11,0|166||package:227:8 oz|
hummus||produce|F|166,8,14,9.6,6|246||tub:283:10 oz|
chicken breast|chicken breasts,boneless skinless chicken breast,boneless skinless chicken breasts,chicken breast halves,chicken tenders,chicken tenderloins,chicken cutlets|meat|F|120,22.5,0,2.6,0||225||
chicken thighs|chicken thigh,boneless skinless chicken thighs,bone-in chicken thighs,skin-on chicken thighs|meat|F|144,18,0,8,0||115||
chicken drumsticks|drumsticks,chicken legs,chicken leg quarters|meat|F|161,19,0,9,0||110||
chicken wings|wings,chicken wingettes|meat|F|191,17.5,0,12.8,0||32||
whole chicken|whole chickens,whole roasting chicken|meat|F|215,18.6,0,15,0||1800||
chicken|cooked chicken,shredded chicken,rotisserie chicken,diced chicken,chopped chicken,shredded cooked chicken|meat|F|165,31,0,3.6,0|140|||
ground chicken||meat|F|143,17.4,0,8.1,0|225||package:454:1 lb|
ground turkey|lean ground turkey|meat|F|148,19.7,0,7.7,0|225||package:454:1 lb|
turkey|turkey breast,sliced turkey,deli turkey,turkey deli meat|meat|F|104,17,4,2,0|140|28||
ground beef|lean ground beef,extra lean ground beef,hamburger meat,minced beef,beef mince|meat|F|215,18.6,0,15,0|225||package:454:1 lb|
steak|sirloin,sirloin steak,ribeye,ribeye steak,flank steak,skirt steak,strip steak,new york strip,flat iron steak,beef tenderloin,steaks,top sirloin|meat|F|180,21,0,10,0||300||
beef chuck|chuck roast,beef stew meat,stew meat,pot roast,beef chuck roast,brisket,beef roast|meat|F|200,19,0,13.5,0|||
short ribs|beef short ribs|meat|F|290,16,0,25,0||||
pork chops|pork chop,boneless pork chops,bone-in pork chops|meat|F|146,21,0,6.3,0||170||
pork tenderloin|pork loin|meat|F|120,21,0,3.5,0||500||
pork shoulder|pork butt,boston butt,pulled pork|meat|F|200,17,0,14,0||||
ground pork||meat|F|263,17,0,21,0|225||package:454:1 lb|
bacon|bacon slices,slices bacon,strips bacon,thick-cut bacon,thick cut bacon|meat|F|417,13,1.4,40,0||25|package:340:12 oz|
hot dogs|hot dog,frankfurters,frankfurter,franks,wieners,beef franks,beef hot dogs|meat|F|290,10,4,26,0||45|package:340:8 franks|
sausage|italian sausage,sausages,pork sausage,breakfast sausage,chorizo,kielbasa,andouille sausage,andouille,sweet italian sausage,hot italian sausage,chicken sausage|meat|F|300,14,2,26,0||85|package:454:1 lb|
ham|diced ham,deli ham,cooked ham|meat|F|145,21,1.5,6,0|135|28||
prosciutto|pancetta|meat|F|250,26,0,16,0||15|package:113:4 oz|
pepperoni||meat|F|494,23,1.2,44,0||2|package:170:6 oz|
lamb|ground lamb,lamb chops,leg of lamb|meat|F|282,16.6,0,23.4,0|225|||
salmon|salmon fillet,salmon fillets,salmon filets|seafood|F|208,20,0,13,0||170||
shrimp|prawns,large shrimp,jumbo shrimp,raw shrimp|seafood|F|85,20,0.2,0.5,0||15||
white fish|cod,cod fillets,tilapia,tilapia fillets,halibut,mahi mahi,white fish fillets,haddock,snapper|seafood|F|82,18,0,0.7,0||170||
scallops|sea scallops|seafood|F|69,12,3,0.5,0||30||
crab|crab meat,lump crab meat|seafood|F|83,18,0,0.7,0|135|||
tuna|canned tuna,tuna fish,albacore tuna|canned|F|116,26,0,0.8,0|||can:142:5 oz|
eggs|egg,large eggs,large egg|dairy|F|143,12.6,0.7,9.5,0|243|50|dozen:600:12 eggs|
egg whites|egg white|dairy|F|52,10.9,0.7,0.2,0|243|33||
egg yolks|egg yolk|dairy|F|322,15.9,3.6,26.5,0|243|17||
butter|unsalted butter,salted butter|dairy|P|717,0.9,0.1,81,0|227||box:454:4 sticks|
milk|whole milk,2% milk,skim milk,low-fat milk,dairy milk|dairy|F|61,3.2,4.8,3.3,0|244||half gallon:1890:64 fl oz|L
plant milk|almond milk,oat milk,soy milk,unsweetened almond milk|dairy|F|17,0.6,0.6,1.3,0.2|240||carton:1890:64 fl oz|L
heavy cream|heavy whipping cream,whipping cream,double cream,cream|dairy|F|340,2.8,2.7,36,0|238||pint:476:16 fl oz|L
half and half|half-and-half,half & half,half n half|dairy|F|131,3,4.3,11.5,0|242||pint:484:16 fl oz|L
sour cream||dairy|F|198,2.4,4.6,19,0|230||tub:454:16 oz|
greek yogurt|plain greek yogurt,nonfat greek yogurt|dairy|F|73,10,3.9,1.9,0|245||tub:907:32 oz|
yogurt|plain yogurt|dairy|F|61,3.5,4.7,3.3,0|245||tub:907:32 oz|
cream cheese||dairy|F|342,6,4,34,0|232||block:227:8 oz|
buttermilk||dairy|F|40,3.3,4.8,0.9,0|245||quart:980:32 fl oz|L
cheddar|cheddar cheese,sharp cheddar,sharp cheddar cheese,shredded cheddar,shredded cheddar cheese|dairy|F|403,25,1.3,33,0|113|28|bag:227:8 oz|
mozzarella|mozzarella cheese,shredded mozzarella,shredded mozzarella cheese,fresh mozzarella,burrata|dairy|F|280,28,3.1,17,0|113|28|bag:227:8 oz|
parmesan|parmesan cheese,parmigiano reggiano,parmigiano-reggiano,grated parmesan,grated parmesan cheese,pecorino,pecorino romano|dairy|P|431,38,4.1,29,0|100||wedge:142:5 oz|
feta|feta cheese,crumbled feta|dairy|F|264,14,4,21,0|150||package:170:6 oz|
monterey jack|monterey jack cheese,~colby jack,~mexican cheese blend,~mexican blend cheese,shredded cheese,cheese|dairy|F|373,24,0.7,30,0|113|28|bag:227:8 oz|
pepper jack|pepper jack cheese,pepperjack|dairy|F|373,24,0.7,30,0|113|28|block:227:8 oz|
string cheese|cheese sticks,cheese stick,string cheeses|dairy|F|300,24,3,21,0||28|pack:340:12 sticks|
goat cheese|chevre|dairy|F|364,22,0,30,0|||log:113:4 oz|
ricotta|ricotta cheese|dairy|F|174,11,3,13,0|246||tub:425:15 oz|
swiss cheese|gruyere,gruyère,provolone,gruyere cheese,provolone cheese|dairy|F|380,27,1.5,30,0|108|20|package:227:8 oz|
cottage cheese||dairy|F|98,11,3.4,4.3,0|226||tub:454:16 oz|
bread|sandwich bread,white bread,whole wheat bread,~sourdough,~sourdough bread,bread slices,slices bread,crusty bread,~baguette,~ciabatta|bakery|F|265,9,49,3.2,2.7||30|loaf:567|
banana bread|banana loaf|bakery|F|326,4.3,55,10.5,1.1|||loaf:450:16 oz|
burger buns|hamburger buns,buns,brioche buns,hot dog buns,slider buns|bakery|F|279,9.5,49,4.3,2||55|pack:440:8 buns|
tortillas|flour tortillas,tortilla,flour tortilla,wraps|bakery|F|312,8.3,52,8,3.5||45|pack:450:10 tortillas|
corn tortillas|corn tortilla,taco shells|bakery|F|218,5.7,45,2.9,6.3||26|pack:780:30 tortillas|
pita|pita bread,naan,flatbread,naan bread|bakery|F|275,9,55,1.2,2.2||60|pack:300:5 pieces|
english muffins|english muffin,bagels,bagel|bakery|F|235,8,46,1.8,2.7||60|pack:360:6 pieces|
breadcrumbs|bread crumbs,panko,panko breadcrumbs,panko bread crumbs,italian breadcrumbs|dry|P|395,13,72,5.3,4.5|108||canister:227:8 oz|
pasta|spaghetti,penne,penne pasta,rigatoni,fettuccine,linguine,rotini,fusilli,farfalle,bow tie pasta,macaroni,elbow macaroni,elbow pasta,ziti,orecchiette,pappardelle,angel hair,angel hair pasta,bucatini,shells,pasta shells,medium shells,tagliatelle,dried pasta,short pasta,cavatappi,gemelli,campanelle,spaghetti noodles|dry|F|371,13,75,1.5,3.2|100||box:454:16 oz|
orzo||dry|F|371,13,75,1.5,3.2|180||box:454:16 oz|
egg noodles|wide egg noodles|dry|F|384,14,71,4.4,3.3|38||bag:340:12 oz|
lasagna noodles|lasagna sheets,lasagne noodles,lasagna|dry|F|371,13,75,1.5,3.2||20|box:454:16 oz|
asian noodles|rice noodles,ramen noodles,soba noodles,udon,udon noodles,lo mein noodles,rice vermicelli,pad thai noodles,ramen|dry|F|364,6,80,0.6,1.6|||package:227:8 oz|
gnocchi|potato gnocchi|dry|F|133,3.3,29,0.3,1.5|||package:454:16 oz|
rice|white rice,long grain rice,long-grain white rice,long grain white rice,jasmine rice,basmati rice,uncooked rice,sushi rice|dry|P|365,7.1,80,0.7,1.3|185||bag:907:2 lb|
brown rice|uncooked brown rice|dry|P|367,7.5,76,3.2,3.4|190||bag:907:2 lb|
arborio rice|risotto rice,carnaroli rice|dry|P|360,7,79,0.6,1|200||box:454:1 lb|
cooked rice|cooked white rice,cooked jasmine rice,leftover rice,cooked brown rice,day-old rice|dry|P|130,2.7,28,0.3,0.4|158||bag:2720:2 lb uncooked|
quinoa|dry quinoa,uncooked quinoa|dry|P|368,14,64,6,7|170||bag:340:12 oz|
couscous|pearl couscous,israeli couscous|dry|P|376,12.8,77,0.6,5|173||box:283:10 oz|
oats|rolled oats,old-fashioned oats,old fashioned oats,old-fashioned rolled oats,quick oats,quick-cooking oats,oatmeal,steel cut oats|dry|P|379,13,68,6.5,10|81||canister:510:18 oz|
granola|granola clusters,muesli|dry|P|471,10,64,20,7|122||bag:340:12 oz|
lentils|red lentils,green lentils,brown lentils,dried lentils,french lentils|dry|P|352,24.6,63,1.1,10.7|192||bag:454:1 lb|
cornmeal|polenta,yellow cornmeal,grits|dry|P|370,7,79,1.8,7|157||bag:680:24 oz|
tortilla chips|chips|snacks|F|489,7,63,23,4.4|||bag:312:11 oz|
potato chips|~kettle chips,~salt and vinegar chips,potato crisps,crisps|snacks|F|536,7,53,35,4.4|||bag:226:8 oz|
crackers|cracker,~saltines,~saltine crackers,~graham crackers,~ritz crackers,~wheat thins|snacks|F|484,9,67,20,2.5|||box:255:9 oz|
pretzels|pretzel,pretzel twists,pretzel rods|snacks|F|380,10,80,3,3|||bag:454:16 oz|
popcorn|microwave popcorn,popcorn kernels|snacks|F|387,13,78,4.5,15|8||box:255:6 bags|
granola bars|granola bar,~protein bars,~protein bar,cereal bars,cereal bar|snacks|F|471,10,64,20,5|||box:240:8 bars|
cereal|breakfast cereal,~corn flakes,~cornflakes,~cheerios,~bran flakes,~raisin bran,~rice krispies,~frosted flakes|dry|F|357,7,84,0.4,3|28||box:340:12 oz|
flour|all-purpose flour,all purpose flour,plain flour,ap flour,bread flour,unbleached all-purpose flour,self-rising flour|baking|P|364,10,76,1,2.7|125||bag:2268:5 lb|
whole wheat flour|whole-wheat flour,whole wheat pastry flour|baking|P|340,13,72,2.5,10.7|120||bag:2268:5 lb|
almond flour|almond meal|baking|P|571,21,21,50,10|96||bag:454:16 oz|
cornstarch|corn starch,cornflour|baking|P|381,0.3,91,0.1,0.9|128||box:454:16 oz|
sugar|granulated sugar,white sugar,caster sugar,cane sugar|baking|P|387,0,100,0,0|200||bag:1814:4 lb|
brown sugar|light brown sugar,dark brown sugar,packed brown sugar,packed light brown sugar,coconut sugar|baking|P|380,0.1,98,0,0|220||bag:907:2 lb|
powdered sugar|confectioners sugar,confectioners' sugar,icing sugar|baking|P|389,0,100,0,0|120||bag:907:2 lb|
baking powder||baking|P|53,0,28,0,0.2|220||can:230:8 oz|
baking soda|bicarbonate of soda,bicarb soda|baking|P|0,0,0,0,0|220||box:454:1 lb|
yeast|active dry yeast,instant yeast,rapid rise yeast|baking|P|325,40,41,7.6,27|144|7|strip:21:3 packets|
vanilla extract|vanilla,pure vanilla extract,vanilla bean paste|baking|P|288,0.1,12.7,0.1,0|208||bottle:59:2 fl oz|L
chocolate chips|semisweet chocolate chips,semi-sweet chocolate chips,chocolate chunks,dark chocolate,milk chocolate chips,dark chocolate chips|baking|P|480,4.2,64,24,6|170||bag:340:12 oz|
cocoa powder|unsweetened cocoa powder,cocoa,dutch-process cocoa|baking|P|228,19.6,58,13.7,37|86||canister:226:8 oz|
shredded coconut|coconut flakes,sweetened shredded coconut,unsweetened coconut|baking|P|660,6.9,24,64,16|93||bag:198:7 oz|
honey|raw honey|condiments|P|304,0.3,82,0,0.2|340||bottle:340:12 oz|
maple syrup|pure maple syrup|condiments|P|260,0,67,0.1,0|315||bottle:420:12 fl oz|
olive oil|extra virgin olive oil,extra-virgin olive oil,evoo,light olive oil|condiments|S|884,0,0,100,0|216||bottle:1000:1 L|L
vegetable oil|canola oil,neutral oil,avocado oil,cooking oil,oil,grapeseed oil,sunflower oil,peanut oil|condiments|S|884,0,0,100,0|218||bottle:1400:48 fl oz|L
sesame oil|toasted sesame oil|condiments|P|884,0,0,100,0|218||bottle:148:5 fl oz|L
coconut oil||condiments|P|862,0,0,100,0|218||jar:414:14 oz|
cooking spray|nonstick spray,nonstick cooking spray,non-stick cooking spray|condiments|S|0,0,0,0,0||||
soy sauce|low-sodium soy sauce,low sodium soy sauce,tamari,shoyu,coconut aminos|condiments|P|53,8.1,4.9,0.6,0.8|255||bottle:296:10 fl oz|L
fish sauce||condiments|P|35,5,3.6,0,0|288||bottle:200:7 fl oz|L
oyster sauce||condiments|P|51,1.4,11,0.3,0.3|288||bottle:255:9 oz|
hoisin sauce|hoisin|condiments|P|220,3.3,44,3.4,2.8|258||jar:240:8.5 oz|
sriracha|hot sauce,chili garlic sauce,sambal oelek,tabasco,buffalo sauce,gochujang|condiments|P|93,1.9,19,0.9,2.2|272||bottle:482:17 oz|
miso|miso paste,white miso,red miso,yellow miso,shiro miso|condiments|P|198,12,26,6,5.4|275||tub:397:14 oz|
worcestershire sauce|worcestershire|condiments|P|78,0,19.5,0,0|275||bottle:296:10 fl oz|L
mustard|dijon mustard,dijon,whole grain mustard,yellow mustard,stone ground mustard|condiments|P|66,4.4,5.8,4,4|250||jar:227:8 oz|
ketchup||condiments|P|101,1,27,0.1,0.3|240||bottle:567:20 oz|
mayonnaise|mayo|condiments|P|680,1,0.6,75,0|220||jar:887:30 oz|
bbq sauce|barbecue sauce|condiments|P|172,0.8,41,0.6,0.9|286||bottle:510:18 oz|
teriyaki sauce||condiments|P|89,5.9,16,0,0.1|288||bottle:295:10 fl oz|
salsa|salsa verde,pico de gallo|condiments|P|36,1.5,7,0.2,1.9|259||jar:454:16 oz|
pesto|basil pesto|condiments|P|418,5,6,42,1.5|240||jar:170:6 oz|
curry paste|red curry paste,green curry paste,thai curry paste,yellow curry paste|condiments|P|120,2,15,5,4|240||jar:113:4 oz|
tahini||condiments|P|595,17,21,54,9|240||jar:454:16 oz|
peanut butter|creamy peanut butter,natural peanut butter,almond butter|condiments|P|588,25,20,50,6|258||jar:454:16 oz|
jam|jelly,preserves,fruit preserves|condiments|P|250,0.4,69,0.1,1|320||jar:510:18 oz|
white vinegar|distilled white vinegar,vinegar|condiments|P|18,0,0.04,0,0|238||bottle:946:32 fl oz|L
apple cider vinegar|cider vinegar|condiments|P|21,0,0.9,0,0|238||bottle:473:16 fl oz|L
red wine vinegar|white wine vinegar,sherry vinegar,champagne vinegar|condiments|P|19,0,0.3,0,0|239||bottle:473:16 fl oz|L
balsamic vinegar|balsamic,balsamic glaze|condiments|P|88,0.5,17,0,0|255||bottle:250:8.5 fl oz|L
rice vinegar|rice wine vinegar,seasoned rice vinegar|condiments|P|18,0,0,0,0|239||bottle:355:12 fl oz|L
white wine|dry white wine|other|P|82,0.1,2.6,0,0|236||bottle:750:750 ml|L
red wine|dry red wine|other|P|85,0.1,2.6,0,0|236||bottle:750:750 ml|L
beer|lager|other|P|43,0.5,3.6,0,0|240||can:355:12 oz|L
marinara sauce|marinara,pasta sauce,spaghetti sauce,tomato basil sauce,jarred marinara|canned|F|50,1.5,8,1.5,2|250||jar:680:24 oz|
diced tomatoes|canned diced tomatoes,fire-roasted diced tomatoes,fire roasted diced tomatoes,petite diced tomatoes,canned tomatoes,diced tomatoes with green chiles,rotel|canned|F|21,0.9,4,0.2,1.9|240||can:411:14.5 oz|
crushed tomatoes|tomato puree,tomato purée,whole peeled tomatoes,san marzano tomatoes,whole tomatoes,peeled tomatoes,canned whole tomatoes,canned crushed tomatoes|canned|F|32,1.6,7.3,0.3,1.9|242||can:794:28 oz|
tomato sauce|canned tomato sauce|canned|F|24,1.2,5.3,0.3,1.5|245||can:227:8 oz|
tomato paste||canned|F|82,4.3,19,0.5,4.1|262||can:170:6 oz|
black beans|canned black beans|canned|F|91,6,16.6,0.3,6.9|172||can:255:15 oz|
kidney beans|red kidney beans,canned kidney beans|canned|F|84,5.2,15,0.4,6|177||can:255:15 oz|
chickpeas|garbanzo beans,garbanzos,canned chickpeas|canned|F|120,7,19,2.6,5.4|164||can:255:15 oz|
white beans|cannellini beans,great northern beans,navy beans,butter beans|canned|F|90,6,16,0.3,5|180||can:255:15 oz|
pinto beans||canned|F|86,5,15,0.6,5|171||can:255:15 oz|
refried beans||canned|F|91,5.4,15,1.2,5|238||can:454:16 oz|
coconut milk|full-fat coconut milk,full fat coconut milk,light coconut milk,canned coconut milk,coconut cream|canned|F|197,2,2.8,21,0|226||can:400:13.5 fl oz|L
chicken broth|chicken stock,low-sodium chicken broth,low sodium chicken broth,bone broth,chicken bone broth|canned|F|6,0.6,0.4,0.2,0|240||carton:960:32 fl oz|L
beef broth|beef stock,low-sodium beef broth|canned|F|7,1.1,0.1,0.2,0|240||carton:960:32 fl oz|L
vegetable broth|vegetable stock,veggie broth,low-sodium vegetable broth|canned|F|5,0.2,0.9,0.1,0|240||carton:960:32 fl oz|L
broth|stock|canned|F|6,0.6,0.4,0.2,0|240||carton:960:32 fl oz|L
green chiles|diced green chiles,canned green chiles,hatch green chiles|canned|F|21,0.7,4.6,0.1,1.9|240||can:113:4 oz|
chipotle peppers in adobo|chipotle in adobo,chipotle peppers,chipotles in adobo,chipotle pepper|canned|P|50,1.5,8,1.5,4||12|can:198:7 oz|
olives|kalamata olives,black olives,green olives,sliced black olives|canned|P|115,0.8,6,10.7,3.2|135|4|jar:170:6 oz|
capers||canned|P|23,2.4,4.9,0.9,3.2|136||jar:100:3.5 oz|
artichoke hearts|artichokes,marinated artichoke hearts|canned|F|45,2.8,9.5,0.3,4.3|168||can:400:14 oz|
roasted red peppers|roasted peppers,jarred roasted red peppers|canned|F|28,1,5,0.3,1.2|180||jar:340:12 oz|
sun-dried tomatoes|sun dried tomatoes,sundried tomatoes|canned|P|213,5,23,14,5.8|110||jar:240:8.5 oz|
almonds|sliced almonds,slivered almonds,whole almonds|dry|P|579,21,22,50,12.5|143||bag:170:6 oz|
walnuts|pecans,chopped walnuts,chopped pecans,pecan halves|dry|P|670,12,14,68,8|117||bag:170:6 oz|
peanuts|cashews,roasted peanuts,raw cashews,pistachios|dry|P|567,22,25,47,6|146||bag:227:8 oz|
pine nuts||dry|P|673,13.7,13,68,3.7|135||bag:113:4 oz|
sesame seeds|toasted sesame seeds|spices|P|573,17.7,23,49.7,11.8|144||jar:57:2 oz|
chia seeds|flax seeds,flaxseed,ground flaxseed,hemp seeds|dry|P|486,16.5,42,31,34|160||bag:340:12 oz|
hemp hearts|hemp heart,hulled hemp seeds,shelled hemp seeds|dry|P|553,31.6,8.7,48.8,4|160||bag:227:8 oz|
dried fruit|raisins,dried cranberries,craisins,dates,medjool dates|dry|P|299,3,79,0.5,3.7|145||box:340:12 oz|
protein powder|whey protein,whey protein powder|other|P|400,80,10,5,0|120|30|container:907:2 lb|
salt|table salt,sea salt,fine salt,fine sea salt,salt to taste|spices|S|0,0,0,0,0|288|||
kosher salt|coarse salt,flaky salt,flaky sea salt,maldon salt,coarse kosher salt|spices|S|0,0,0,0,0|170|||
black pepper|pepper,ground black pepper,freshly ground black pepper,cracked black pepper,peppercorns,ground pepper,fresh cracked pepper|spices|S|251,10,64,3.3,25|110|||
garlic powder|granulated garlic|spices|P|331,17,73,0.7,9|150||jar:85:3 oz|
onion powder|granulated onion|spices|P|341,10,79,1,15|120||jar:75:2.6 oz|
paprika|sweet paprika,hungarian paprika|spices|P|282,14,54,13,35|110||jar:60:2 oz|
smoked paprika||spices|P|282,14,54,13,35|110||jar:60:2 oz|
chili powder|ancho chili powder,chile powder,chipotle chili powder|spices|P|282,13.5,50,14,35|120||jar:70:2.5 oz|
cayenne pepper|cayenne,ground cayenne|spices|P|318,12,57,17,27|90||jar:45:1.6 oz|
red pepper flakes|crushed red pepper,crushed red pepper flakes,red chili flakes,chili flakes,chile flakes|spices|P|318,12,57,17,27|90||jar:45:1.6 oz|
cumin|ground cumin,cumin seeds,cumin seed|spices|P|375,17.8,44,22,10.5|100||jar:45:1.6 oz|
coriander|ground coriander,coriander seeds|spices|P|298,12.4,55,17.8,42|80||jar:40:1.4 oz|
turmeric|ground turmeric|spices|P|312,9.7,67,3.3,22.7|150||jar:45:1.6 oz|
curry powder|madras curry powder|spices|P|325,14,58,14,53|100||jar:45:1.6 oz|
garam masala||spices|P|380,15,50,15,30|100||jar:45:1.6 oz|
cinnamon|ground cinnamon,cinnamon stick,cinnamon sticks|spices|P|247,4,81,1.2,53|125|3|jar:70:2.5 oz|
saffron|saffron threads|spices|P|310,11,65,6,3.9|21||jar:0.5:0.5 g|
nutmeg|ground nutmeg,freshly grated nutmeg|spices|P|525,5.8,49,36,21|110||jar:30:1 oz|
ground ginger|ginger powder,dried ginger|spices|P|335,9,72,4.2,14|90||jar:40:1.4 oz|
oregano|dried oregano,dry oregano,mexican oregano|spices|P|265,9,69,4.3,42.5|45||jar:20:0.75 oz|
dried basil|dry basil|spices|P|233,23,48,4,37.7|45||jar:20:0.75 oz|
dried thyme|dry thyme,ground thyme|spices|P|276,9,64,7.4,37|45||jar:20:0.75 oz|
dried rosemary|dry rosemary|spices|P|331,4.9,64,15,42.6|45||jar:20:0.75 oz|
dried parsley|parsley flakes,dry parsley|spices|P|292,26.6,50.6,5.5,26.7|25||jar:10:0.3 oz|
dried dill|dill weed,dried dill weed|spices|P|253,20,56,4.4,13.6|45||jar:20:0.75 oz|
italian seasoning|herbes de provence,dried italian herbs|spices|P|265,9,69,4.3,40|45||jar:20:0.75 oz|
bay leaves|bay leaf,dried bay leaves|spices|P|313,7.6,75,8.4,26|10|0.2|jar:5:0.15 oz|
taco seasoning|fajita seasoning,taco seasoning mix|spices|P|300,6,55,6,12|130||packet:28:1 oz|
cajun seasoning|creole seasoning,blackening seasoning,old bay,old bay seasoning|spices|P|250,9,50,6,15|130||jar:70:2.5 oz|
allspice|ground allspice|spices|P|263,6,72,8.7,21.6|100||jar:30:1 oz|
ground cloves|whole cloves|spices|P|274,6,66,13,34|100||jar:30:1 oz|
cardamom|ground cardamom,cardamom pods|spices|P|311,10.8,68,6.7,28|100||jar:30:1 oz|
five spice|chinese five spice,five-spice powder|spices|P|300,10,65,8,30|100||jar:40:1.4 oz|
mustard powder|dry mustard,ground mustard,mustard seeds|spices|P|508,26,28,36,12|100||jar:45:1.6 oz|
fennel seeds|fennel seed|spices|P|345,15.8,52,14.9,39.8|100||jar:40:1.4 oz|
everything bagel seasoning||spices|P|400,15,30,25,10|130||jar:65:2.3 oz|
pumpkin pie spice|apple pie spice|spices|P|342,5.8,69,12.6,14.8|100||jar:30:1 oz|
bouillon|chicken bouillon,bouillon cube,bouillon cubes,better than bouillon,beef bouillon,vegetable bouillon|spices|P|250,15,20,12,0|200|4|jar:227:8 oz|
water|cold water,warm water,hot water,boiling water,ice water,lukewarm water,ice cubes|other|X|0,0,0,0,0|236|||L
`;

export const AISLES = [
  ["produce", "Produce"],
  ["meat", "Meat"],
  ["seafood", "Seafood"],
  ["dairy", "Dairy & eggs"],
  ["bakery", "Bakery"],
  ["dry", "Pasta, grains & cereal"],
  ["canned", "Canned & jarred"],
  ["baking", "Baking"],
  ["condiments", "Oils, sauces & condiments"],
  ["spices", "Spices"],
  ["snacks", "Snacks"],
  ["drinks", "Drinks"],
  ["prepared", "Prepared foods"],
  ["frozen", "Frozen"],
  ["other", "Other"]
];

export const FOODS = RAW.trim().split("\n").map(line => {
  const [name, aliases, aisle, kind, nu, gCup, gEach, pkg, flags] = line.split("|");
  const [kcal, protein, carbs, fat, fiber] = nu.split(",").map(Number);
  let p = null;
  if (pkg) {
    const [label, grams, desc] = pkg.split(":");
    p = { label, g: Number(grams), desc: desc || "" };
  }
  // "~alias": a variety, not the food itself ("~corn flakes" under cereal). It counts as the food in
  // recipes (nutrition, aisle, price), but typed into the grocery add box it stays its own item.
  const al = aliases ? aliases.split(",") : [];
  return {
    name,
    aliases: [name, ...al.map(a => a.replace(/^~/, ""))],
    variants: new Set(al.filter(a => a.startsWith("~")).map(a => a.slice(1))),
    aisle, kind,
    nu: { kcal, protein, carbs, fat, fiber },
    gCup: gCup ? Number(gCup) : null,
    gEach: gEach ? Number(gEach) : null,
    pkg: p,
    liquid: (flags || "").includes("L")
  };
});

export const FOOD_BY_NAME = Object.fromEntries(FOODS.map(f => [f.name, f]));

// Longest alias first, so "chicken broth" beats "chicken" and "garlic powder" beats "garlic".
const MATCHERS = FOODS
  .flatMap(f => f.aliases.map(a => ({ a, f })))
  .sort((x, y) => y.a.length - x.a.length)
  .map(({ a, f }) => ({
    f, a,
    re: new RegExp(`(^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(e?s)?(?![a-z])`)
  }));

// Words that only describe a food, so "organic whole milk", "2% milk" or "large brown eggs" are still
// that food. Anything else in front of a food's name makes a different product: "ice cream" is not
// cream, "string cheese" is not Monterey Jack.
const MODIFIERS = new Set(("fresh freshly organic large small medium jumbo extra big whole raw ripe boneless skinless lean " +
  "unsalted salted plain light low-fat lowfat nonfat non-fat fat-free reduced-fat low-sodium reduced-sodium unsweetened " +
  "sweetened frozen chilled cold warm hot red green yellow white black brown golden baby mini sliced diced chopped minced " +
  "shredded grated crushed ground dried canned cooked uncooked toasted roasted pure natural homemade store-bought " +
  "good quality of a the some").split(" "));
// Words that may follow a food's name without changing what it is ("garlic, minced" is written "garlic minced" too).
const AFTER_OK = new Set(("minced chopped diced sliced grated shredded crushed halved quartered peeled seeded cubed melted " +
  "softened divided optional drained rinsed trimmed beaten juiced zested to taste for serving garnish more plus or as needed").split(" "));
const isModifier = w => MODIFIERS.has(w) || /^\d+(\.\d+)?%?$/.test(w);

/**
 * The food a name refers to, and how well it fits:
 *   "exact": the name is the food, give or take describing words ("organic 2% milk" → milk)
 *   "head":  the food's name ends the name, after other words ("string cheese" → cheese): a different
 *            product of the same kind, so a good aisle hint
 *   "loose": the food's name is inside a longer one ("garlic bread" → garlic): most likely something else
 * A food at the end of the name wins over a longer one inside it ("garlic bread" is bread, not garlic).
 */
// Speed: a food's name can only appear in a name that contains its last word (maybe plural), so each
// name is only tested against the foods whose last word it contains, in the same longest-first order;
// and the answer for a name is remembered (the same lines repeat across recipes).
const tokens = t => t.split(/[^a-z0-9%]+/).filter(Boolean);
const BY_LAST = new Map();
MATCHERS.forEach((m, i) => { const last = tokens(m.a.toLowerCase()).pop(); if (!last) return; if (!BY_LAST.has(last)) BY_LAST.set(last, []); BY_LAST.get(last).push(i); });
const memo = new Map();
function candidates(n) {
  const idx = new Set();
  for (const w of tokens(n)) for (const k of [w, w.replace(/e?s$/, "")]) for (const i of BY_LAST.get(k) || []) idx.add(i);
  return [...idx].sort((a, b) => a - b).map(i => MATCHERS[i]);
}

export function matchFoodDetail(name) {
  // "chicken stock or water" is chicken stock: only the first choice counts.
  const n = name.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").split(/\s+or\s+/)[0].trim();
  if (memo.has(n)) return memo.get(n);
  const found = scan(n, candidates(n));
  if (memo.size > 5000) memo.clear();
  memo.set(n, found);
  return found;
}
function scan(n, list) {
  let loose = null;
  for (const m of list) {
    const hit = m.re.exec(n);
    if (!hit) continue;
    const start = hit.index + hit[1].length, end = hit.index + hit[0].length;
    const words = t => t.replace(/[^a-z0-9%\- ]/g, " ").split(" ").filter(Boolean);
    if (words(n.slice(end)).every(w => AFTER_OK.has(w))) {
      return { food: m.f, alias: m.a, fit: words(n.slice(0, start)).every(isModifier) ? "exact" : "head" };
    }
    loose ||= { food: m.f, alias: m.a, fit: "loose" };
  }
  return loose;
}

// The same scan over every food, without the index or memory (tests check both agree).
export const matchFoodDetailFull = name => scan(name.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").split(/\s+or\s+/)[0].trim(), MATCHERS);

export function matchFood(name) {
  return matchFoodDetail(name)?.food || null;
}
