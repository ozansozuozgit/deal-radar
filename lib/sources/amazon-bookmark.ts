// The "Send to Deal Radar" bookmark for Amazon. The daily scan is turned away by Amazon on some
// days, so this runs in the owner's own browser, signed in with their own delivery address: it
// reads the same grocery aisle searches the scan does and posts the cards to /api/import/amazon.
import { AMAZON, AMAZON_AISLES, amazonSearchUrl } from './amazon-parse'

export const AMAZON_PAGES_PER_AISLE = 2

/** What the bookmark runs on any amazon.com page. */
export function amazonBookmarklet(importUrl: string, key: string): string {
  const aisles = AMAZON_AISLES.map(a => ({ url: amazonSearchUrl(a.query).replace('https://www.amazon.com', ''), aisle: a.category }))
  const code = `(async () => {
  if (!/(^|\\.)amazon\\.com$/.test(location.hostname)) return alert('Open Amazon grocery first: ${AMAZON.storefrontUrl}');
  const zip = ((document.querySelector('#glow-ingress-line2') || {}).textContent || '').match(/\\d{5}/);
  if (!zip) return alert('Set your delivery address on Amazon first, then press the bookmark again.');
  const aisles = ${JSON.stringify(aisles)};
  const read = doc => Array.from(doc.querySelectorAll('[data-component-type="s-search-result"][data-asin]')).map(card => {
    const strike = card.querySelector('.a-price.a-text-price'), q = s => card.querySelector(s);
    return {
      asin: card.getAttribute('data-asin') || '',
      title: ((q('[data-cy="title-recipe"] h2') || q('h2') || {}).textContent || '').trim(),
      image: (q('img.s-image') || {}).src || null,
      price: (q('.a-price:not(.a-text-price) .a-offscreen') || {}).textContent || null,
      was: strike ? (strike.querySelector('.a-offscreen') || {}).textContent || null : null,
      wasLabel: strike && strike.parentElement ? strike.parentElement.textContent : null,
      text: (card.textContent || '').replace(/\\s+/g, ' ').slice(0, 800),
    };
  });
  const pages = [];
  try {
    for (const a of aisles) {
      let base = a.url;
      for (let n = 1; n <= ${AMAZON_PAGES_PER_AISLE}; n++) {
        const res = await fetch(n === 1 ? base : base + '&page=' + n, { credentials: 'include' });
        const html = await res.text();
        if (/validateCaptcha/.test(html)) throw new Error('Amazon asked for a captcha; open any Amazon page, solve it, and try again');
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (n === 1) {
          const deals = Array.from(doc.querySelectorAll('#s-refinements a')).find(l => /All Discounts|Today's Deals/.test(l.textContent || ''));
          if (deals) { base = deals.getAttribute('href'); const again = await fetch(base, { credentials: 'include' }); pages.push({ aisle: a.aisle, cards: read(new DOMParser().parseFromString(await again.text(), 'text/html')) }); continue; }
        }
        const cards = read(doc);
        pages.push({ aisle: a.aisle, cards });
        if (!cards.length) break;
      }
    }
    const seen = pages.reduce((n, p) => n + p.cards.length, 0);
    if (!seen) throw new Error('Amazon showed no grocery products; is grocery delivery available at ' + zip[0] + '?');
    const sent = await fetch(${JSON.stringify(importUrl)}, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ${JSON.stringify(key)} }, body: JSON.stringify({ zip: zip[0], pages }) });
    const out = await sent.json().catch(() => ({}));
    if (!sent.ok) throw new Error(out.error || 'Deal Radar answered ' + sent.status);
    alert(out.imported + ' Amazon deals sent to Deal Radar, from ' + seen + ' products, for ' + zip[0] + '.');
  } catch (e) { alert('Amazon import failed: ' + e.message); }
})();`
  return `javascript:${encodeURIComponent(code)}`
}
