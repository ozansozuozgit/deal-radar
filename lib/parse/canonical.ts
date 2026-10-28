// Canonical products: "Perdue Boneless Skinless Chicken Breasts Family Pack" and
// "chicken breast" are the same thing to a shopper. A curated dictionary covers the
// staples; ingest asks Gemini for the rest (lib/ingest/canonical.ts).
//
// Rules are tried in order and the first match wins, so specific products come
// before general ones ("chicken breast" before "chicken", "ice cream" before "cream").

const RULES: Array<[string, RegExp]> = [
  // pet food mentions meats, and must not match them
  ['pet food', /(?<!hot )\bdogs?\b|\b(?:cats?|puppy|kitten|pets?)\b/],
  ['frozen pizza', /\bpizza\b/],
  // seafood
  ['salmon', /\bsalmon\b/],
  ['shrimp', /\bshrimp\b|\bprawns?\b/],
  ['tilapia', /\btilapia\b/],
  ['cod', /\bcod\b/],
  ['tuna steak', /\btuna steaks?\b|\bahi\b/],
  ['canned tuna', /\btuna\b/],
  ['crab', /\bcrab\b/],
  ['scallops', /\bscallops?\b/],
  // meat & poultry
  ['chicken breast', /\bchicken\b.*\bbreasts?\b|\bbreasts?\b.*\bchicken\b|\bchicken (?:breast )?(?:cutlets?|tenderloins?|tenders)\b/],
  ['chicken thighs', /\bchicken\b.*\bthighs?\b|\bthighs?\b.*\bchicken\b/],
  ['chicken wings', /\bchicken\b.*\bwings?\b|\bwings?\b.*\bchicken\b/],
  ['chicken drumsticks', /\bchicken\b.*\b(?:drumsticks?|legs?)\b/],
  ['ground turkey', /\bground turkey\b/],
  ['ground chicken', /\bground chicken\b/],
  ['ground beef', /\bground (?:beef|chuck|round|sirloin)\b|\bhamburger meat\b|\blean ground\b/],
  ['whole chicken', /\bwhole (?:fryer )?chicken\b|\brotisserie chicken\b|\broaster chicken\b/],
  ['turkey breast', /\bturkey breast\b/],
  ['whole turkey', /\bwhole turkey\b|\bturkey\b.*\b(?:frozen|fresh) whole\b|\bbutterball turkey\b/],
  ['steak', /\b(?:ribeye|rib eye|sirloin|strip|t-?bone|porterhouse|flank|skirt|chuck eye|london broil|filet mignon)\b.*\bsteaks?\b|\bsteaks?\b/],
  ['beef roast', /\b(?:chuck|rump|round|bottom round|top round|eye of round)\b.*\broast\b|\bpot roast\b|\bbrisket\b/],
  ['pork chops', /\bpork\b.*\bchops?\b/],
  ['pork tenderloin', /\bpork tenderloin\b/],
  ['pork shoulder', /\bpork (?:shoulder|butt)\b/],
  ['ribs', /\bribs?\b/],
  ['bacon', /\bbacon\b/],
  ['sausage', /\bsausages?\b|\bbratwurst\b|\bkielbasa\b|\bchorizo\b/],
  ['hot dogs', /\bhot dogs?\b|\bfranks?\b|\bfrankfurters?\b|\bwieners?\b/],
  ['ham', /\bham\b/],
  ['deli turkey', /\b(?:deli|sliced|oven roasted|smoked)\b.*\bturkey\b/],
  ['salami', /\bsalami\b|\bpepperoni\b|\bprosciutto\b/],
  ['lamb', /\blamb\b/],
  // dairy & eggs
  ['eggs', /\beggs?\b(?! noodles| rolls?| nog)/],
  ['ice cream', /\bice cream\b|\bgelato\b|\bfrozen custard\b/],
  ['cream cheese', /\bcream cheese\b/],
  ['sour cream', /\bsour cream\b/],
  ['heavy cream', /\b(?:heavy|whipping) cream\b/],
  ['half and half', /\bhalf (?:and|&|n) half\b/],
  ['coffee creamer', /\bcreamer\b/],
  ['oat milk', /\boat milk\b|\boatmilk\b/],
  ['almond milk', /\balmond milk\b|\balmondmilk\b/],
  ['milk', /\bmilk\b(?! chocolate)/],
  ['greek yogurt', /\bgreek\b.*\byogh?urt\b|\bskyr\b/],
  ['yogurt', /\byogh?urts?\b/],
  ['peanut butter', /\bpeanut butter\b/],
  ['butter', /\bbutter\b(?!milk| ?nut|scotch)/],
  ['shredded cheese', /\bshredded\b.*\bcheese\b/],
  ['sliced cheese', /\bsliced\b.*\bcheese\b|\bcheese slices\b|\bsingles\b/],
  ['mozzarella', /\bmozzarella\b/],
  ['cheddar', /\bcheddar\b/],
  ['parmesan', /\bparmesan\b|\bparmigiano\b/],
  ['feta', /\bfeta\b/],
  ['cottage cheese', /\bcottage cheese\b/],
  ['cheese', /\bcheeses?\b/],
  // produce
  ['strawberries', /\bstrawberr/],
  ['blueberries', /\bblueberr/],
  ['raspberries', /\braspberr/],
  ['blackberries', /\bblackberr/],
  ['grapes', /\bgrapes?\b/],
  ['bananas', /\bbananas?\b/],
  ['apples', /\bapples?\b(?! juice| sauce|sauce)/],
  ['oranges', /\b(?:navel |cara cara |blood )?oranges?\b(?! juice)|\bclementines?\b|\bmandarins?\b|\bcuties\b|\bhalos\b/],
  ['lemons', /\blemons?\b(?!ade)/],
  ['limes', /\blimes?\b/],
  ['avocados', /\bavocados?\b/],
  ['mangoes', /\bmangos?\b|\bmangoes\b/],
  ['pineapple', /\bpineapples?\b/],
  ['watermelon', /\bwatermelons?\b/],
  ['peaches', /\bpeach(?:es)?\b|\bnectarines?\b/],
  ['pears', /\bpears?\b/],
  ['cherries', /\bcherr(?:y|ies)\b/],
  ['tomatoes', /\btomato(?:es)?\b(?! sauce| paste)/],
  ['sweet potatoes', /\bsweet potato(?:es)?\b|\byams?\b/],
  ['potatoes', /\bpotato(?:es)?\b(?! chips)/],
  ['onions', /\bonions?\b/],
  ['garlic', /\bgarlic\b(?! bread)/],
  ['bell peppers', /\bbell peppers?\b|\b(?:red|green|yellow|orange) peppers?\b/],
  ['broccoli', /\bbroccoli\b/],
  ['cauliflower', /\bcauliflower\b/],
  ['carrots', /\bcarrots?\b/],
  ['celery', /\bcelery\b/],
  ['cucumbers', /\bcucumbers?\b/],
  ['zucchini', /\bzucchini\b|\bsquash\b/],
  ['spinach', /\bspinach\b/],
  ['lettuce', /\blettuce\b|\bromaine\b|\bspring mix\b|\bsalad mix\b|\bsalad kit\b/],
  ['kale', /\bkale\b/],
  ['mushrooms', /\bmushrooms?\b/],
  ['corn', /\bcorn on the cob\b|\bsweet corn\b|\bears? of corn\b/],
  ['asparagus', /\basparagus\b/],
  ['green beans', /\bgreen beans?\b/],
  // bakery
  ['bread', /\bbread\b|\bloaf\b/],
  ['bagels', /\bbagels?\b/],
  ['tortillas', /\btortillas?\b(?! chips)|\bwraps?\b/],
  ['english muffins', /\benglish muffins?\b/],
  ['buns', /\bbuns?\b|\brolls?\b/],
  // pantry
  ['pasta sauce', /\b(?:pasta|spaghetti|marinara|tomato|alfredo|vodka) sauce\b/],
  ['pasta', /\bpasta\b|\bspaghetti\b|\bpenne\b|\brigatoni\b|\bfettuccine\b|\blinguine\b|\bmacaroni\b|\brotini\b|\bfarfalle\b/],
  ['rice', /\brice\b(?! cakes?| krispies)/],
  ['olive oil', /\bolive oil\b/],
  ['cooking oil', /\b(?:vegetable|canola|avocado|corn|sunflower) oil\b/],
  ['cereal', /\bcereal\b|\bcheerios\b|\bfrosted flakes\b|\bcorn flakes\b|\braisin bran\b|\bgranola cereal\b/],
  ['oatmeal', /\boats\b|\boatmeal\b/],
  ['coffee', /\bcoffee\b(?! creamer)|\bk-?cups?\b|\bespresso\b/],
  ['tea', /\btea\b(?! tree)/],
  ['flour', /\bflour\b/],
  ['sugar', /\bsugar\b(?! free)/],
  ['canned beans', /\b(?:black|kidney|pinto|garbanzo|cannellini|refried) beans\b|\bchickpeas\b/],
  ['soup', /\bsoups?\b|\bbroth\b|\bstock\b/],
  // drinks
  ['orange juice', /\borange juice\b|\boj\b/],
  ['juice', /\bjuices?\b/],
  ['sparkling water', /\bsparkling water\b|\bseltzer\b|\bla ?croix\b|\bbubly\b/],
  ['water', /\bspring water\b|\bbottled water\b|\bwater\b/],
  ['soda', /\bsoda\b|\bcola\b|\bcoke\b|\bpepsi\b|\bsprite\b|\bginger ale\b|\bdr pepper\b/],
  // snacks & frozen
  ['chips', /\bchips\b|\btortilla chips\b|\bdoritos\b|\bpringles\b|\bcheetos\b/],
  ['crackers', /\bcrackers?\b/],
  ['cookies', /\bcookies?\b|\boreos?\b/],
  ['frozen vegetables', /\bfrozen\b.*\b(?:vegetables|veggies|peas|corn|broccoli|spinach|mixed)\b/],
  // household
  ['paper towels', /\bpaper towels?\b/],
  ['toilet paper', /\btoilet paper\b|\bbath tissue\b/],
  ['dish soap', /\bdish (?:soap|liquid|detergent)\b|\bdishwasher\b/],
  ['laundry detergent', /\blaundry\b|\bdetergent\b/],
  ['trash bags', /\btrash bags?\b|\bgarbage bags?\b/],
]

function clean(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9&'\s-]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The canonical product for a deal or list item name, or null when it isn't one we know. */
export function canonicalize(name: string | null | undefined): string | null {
  if (!name) return null
  const n = clean(name)
  for (const [canon, re] of RULES) if (re.test(n)) return canon
  return null
}

export const CANONICAL_PRODUCTS: string[] = [...new Set(RULES.map(([c]) => c))]
