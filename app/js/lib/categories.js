// Spending categories: [emoji, color]
export const CATS = {
  Dining: ['🍽️', '#00e5a0'],
  Coffee: ['☕', '#ffb830'],
  Groceries: ['🛒', '#4d9fff'],
  Fuel: ['⛽', '#ff8a4d'],
  Health: ['💊', '#ff4d6a'],
  Shopping: ['🛍️', '#9b8cff'],
  Other: ['🧾', '#5a6478'],
};

export function guessCat(name, items) {
  const n = ((name || '') + ' ' + (items || '')).toLowerCase();
  if (/coffee|cafe|café|espresso|latte|chai|tea house|starbucks|dunkin/.test(n)) return 'Coffee';
  if (/dosa|naan|biryani|restaurant|grill|diner|kitchen|burger|pizza|taco|sushi|bistro|bar|curry|masala|thai|wok|ramen|food/.test(n)) return 'Dining';
  if (/market|grocery|mart|costco|walmart|kroger|aldi|trader|whole foods|produce/.test(n)) return 'Groceries';
  if (/gas|fuel|shell|chevron|exxon|petrol|bp\b/.test(n)) return 'Fuel';
  if (/pharma|drug|cvs|walgreens|health|clinic/.test(n)) return 'Health';
  if (/store|shop|boutique|apparel|target|mall/.test(n)) return 'Shopping';
  return 'Other';
}

export const catOf = (r) => (r.category && CATS[r.category] ? r.category : guessCat(r.merchant_name, r.items));
