// Ordered rules, first match wins. Order matters:
// seafood before meat ("fish" vs generic), frozen before dairy ("ice cream"),
// beverages before produce ("orange juice"), snacks before produce ("potato chips").
const RULES: Array<[RegExp, string]> = [
  [/salmon|halibut|shrimp|tuna|cod\b|tilapia|crab|lobster|scallop|seafood|fish\b/i, 'seafood'],
  [/frozen|ice cream|fruit bars|popsicle/i, 'frozen'],
  [/beef|chicken|pork|turkey|sausage|bacon|ham\b|hot dog|meatball|steak|lamb|kielbasa|salami|deli meat/i, 'meat'],
  [/milk|yogurt|cheese|butter|cream\b|creamer|eggs?\b|cottage/i, 'dairy'],
  [/bread|bagel|bakery|muffin|croissant|rolls?\b|cake|donut/i, 'bakery'],
  [/soda|juice|water\b|coffee|tea\b|malta|drink|beverage|\bcola\b|seltzer|lemonade/i, 'beverages'],
  [/chips|pretzel|popcorn|cracker|cookie|candy|chocolate|granola|trail mix|nuts\b|snack/i, 'snacks'],
  [/berries|blueberr|strawberr|apple|banana|peach|nectarine|avocado|grape|melon|watermelon|cherr|lettuce|tomato|onion|potato|peppers?\b|zucchini|broccoli|spinach|kale|cucumber|carrot|citrus|oranges?\b|lemon|lime|mango|pear\b|plum|apricot|grapefruit|produce|salad|vegetable|fruit\b/i, 'produce'],
  [/paper towel|toilet|detergent|dish\b|cleaner|bleach|trash|foil|napkin|swiffer|air freshener/i, 'household'],
  [/toothpaste|shampoo|soap\b|deodorant|razor|lotion|vitamins?\b|body wash/i, 'personal-care'],
  [/pasta|sauce|rice\b|beans|canned|soup|cereal|flour|sugar|oil\b|vinegar|condiment|ketchup|mayo|salsa|spice|seasoning|peanut butter|jelly/i, 'pantry'],
]

export function categorize(name: string): string {
  for (const [re, cat] of RULES) if (re.test(name)) return cat
  return 'other'
}
