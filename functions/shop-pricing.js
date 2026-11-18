/* ============================================================
   Resources Shop pricing rules — pure functions, no database.
   Used by createCheckoutSession (index.js) and unit-tested by
   tests/shop-pricing.test.mjs. The browser mirrors the discount
   checks in shop-system.js only to show an estimate.
   ============================================================ */

function easternToday(now = new Date()){
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Why a Shop code can't be used right now, or '' when it can.
// Dates are 'YYYY-MM-DD' in Eastern time; expiresAt is the last valid day.
function shopDiscountProblem(code, today, liveMode){
  if(!code || code.scope !== 'shop') return 'That code can’t be used in the Shop.';
  if(code.active === false) return 'That discount code is paused.';
  if(code.testOnly === true && liveMode) return 'That discount code is not active.';
  if(code.startsAt && today < code.startsAt) return 'That discount code isn’t active yet.';
  if(code.expiresAt && today > code.expiresAt) return 'That discount code has expired.';
  const max = code.maxUses === null || code.maxUses === undefined || code.maxUses === '' ? null : Number(code.maxUses);
  if(max !== null && (Number(code.usedCount) || 0) >= max) return 'That discount code has reached its usage limit.';
  return '';
}

// One-on-One / class codes. The member reserves ("claims") a use in the
// browser before the booking exists, then pays later — so the dates are
// judged on the day of that claim (its server-set createdAt, Eastern),
// not the day of payment. A claim made after the end date, before the
// start date, on a paused code or for the wrong kind of purchase is
// never honored. Returns '' when the discount may be applied.
function sessionDiscountProblem(code, scope, claimDay){
  if(!code) return 'not-found';
  if(code.active === false) return 'paused';
  if(code.scope !== 'both' && code.scope !== scope) return 'wrong-scope';
  if(!claimDay) return 'no-claim-date';
  if(code.startsAt && claimDay < code.startsAt) return 'not-started';
  if(code.expiresAt && claimDay > code.expiresAt) return 'expired';
  return '';
}

// Splits a discount across the eligible lines in proportion to their
// value, to the cent (largest remainder), never more than a line costs.
function allocateDiscount(lines, eligible, discountCents){
  const base = lines.map((l, i) => eligible[i] ? l.unitCents * l.quantity : 0);
  const total = base.reduce((a, b) => a + b, 0);
  if(total <= 0 || discountCents <= 0) return lines.map(() => 0);
  const capped = Math.min(discountCents, total);
  const raw = base.map(v => v * capped / total);
  const out = raw.map(Math.floor);
  let left = capped - out.reduce((a, b) => a + b, 0);
  raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
    .forEach(({ i }) => { if(left > 0 && eligible[i] && out[i] < base[i]){ out[i] += 1; left -= 1; } });
  return out;
}

// Stripe needs a whole-cent unit price per line. A line of 3 at $10
// with $1.00 off becomes 2 × $9.67 + 1 × $9.66 — same total to the cent.
function stripeLinesFor(lines){
  const out = [];
  lines.forEach(l => {
    const lineTotal = l.unitCents * l.quantity - (l.discountCents || 0);
    const unit = Math.floor(lineTotal / l.quantity);
    const extra = lineTotal - unit * l.quantity;
    if(extra > 0) out.push({ ...l, unitCents: unit + 1, quantity: extra });
    if(l.quantity - extra > 0) out.push({ ...l, unitCents: unit, quantity: l.quantity - extra });
  });
  return out.filter(l => l.quantity > 0);
}

// Identifies "the same bag at the same prices with the same code", so a
// second Checkout click reuses the open order instead of making another.
function shopSignature(lines, discount){
  return JSON.stringify([lines.map(l => [l.productId, l.option, l.quantity, l.unitCents]).sort(), discount ? [discount.codeId, discount.discountCents] : null]);
}

module.exports = { easternToday, shopDiscountProblem, sessionDiscountProblem, allocateDiscount, stripeLinesFor, shopSignature };
