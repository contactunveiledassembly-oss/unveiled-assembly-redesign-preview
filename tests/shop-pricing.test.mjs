// Unit tests for the server's Shop pricing rules (functions/shop-pricing.js).
//   node tests/shop-pricing.test.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { easternToday, shopDiscountProblem, sessionDiscountProblem, allocateDiscount, stripeLinesFor, shopSignature } = require('../functions/shop-pricing.js');

const results = [];
function test(name, fn){ try { fn(); results.push('PASS ' + name); } catch (err) { results.push('FAIL ' + name + ' — ' + err.message.split('\n')[0]); } }
const code = over => ({ scope: 'shop', active: true, type: 'percent', amount: 10, usedCount: 0, maxUses: null, ...over });
const sum = list => list.reduce((a, b) => a + b, 0);
const total = lines => lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);

test('valid code has no problem', () => assert.equal(shopDiscountProblem(code(), '2026-11-06', false), ''));
test('session/class code is refused in the Shop', () => assert.match(shopDiscountProblem(code({ scope: 'both' }), '2026-11-06', false), /can’t be used in the Shop/));
test('paused code is refused', () => assert.match(shopDiscountProblem(code({ active: false }), '2026-11-06', false), /paused/));
test('last day is still valid; the day after is expired', () => {
  assert.equal(shopDiscountProblem(code({ expiresAt: '2026-11-06' }), '2026-11-06', false), '');
  assert.match(shopDiscountProblem(code({ expiresAt: '2026-11-05' }), '2026-11-06', false), /expired/);
});
test('not started yet', () => assert.match(shopDiscountProblem(code({ startsAt: '2026-11-07' }), '2026-11-06', false), /isn’t active yet/));
test('usage limit reached', () => {
  assert.equal(shopDiscountProblem(code({ maxUses: 3, usedCount: 2 }), '2026-11-06', false), '');
  assert.match(shopDiscountProblem(code({ maxUses: 3, usedCount: 3 }), '2026-11-06', false), /usage limit/);
});
test('test-only code works with test keys, refused with live keys', () => {
  assert.equal(shopDiscountProblem(code({ testOnly: true }), '2026-11-06', false), '');
  assert.match(shopDiscountProblem(code({ testOnly: true }), '2026-11-06', true), /not active/);
});
test('Eastern date is used (01:00 UTC on Nov 7 is still Nov 6 in New York)', () => assert.equal(easternToday(new Date('2026-11-07T01:00:00Z')), '2026-11-06'));

const lines = [{ productId: 'a', unitCents: 1800, quantity: 1 }, { productId: 'b', unitCents: 1000, quantity: 3 }, { productId: 'c', unitCents: 999, quantity: 1 }];
test('discount splits to the exact cent across eligible lines', () => {
  const out = allocateDiscount(lines, [true, true, true], 1001);
  assert.equal(sum(out), 1001);
  out.forEach((v, i) => assert.ok(v <= lines[i].unitCents * lines[i].quantity));
});
test('product-scoped discount never touches other lines', () => {
  const out = allocateDiscount(lines, [false, true, false], 500);
  assert.deepEqual(out, [0, 500, 0]);
});
test('a discount larger than the eligible value is capped (never negative)', () => {
  const out = allocateDiscount(lines, [true, false, false], 99999);
  assert.deepEqual(out, [1800, 0, 0]);
});
test('no eligible lines → no discount', () => assert.deepEqual(allocateDiscount(lines, [false, false, false], 500), [0, 0, 0]));
test('Stripe lines keep the exact total after a discount', () => {
  const discounted = lines.map((l, i) => ({ ...l, discountCents: [181, 100, 0][i] }));
  const stripe = stripeLinesFor(discounted);
  assert.equal(total(stripe), total(lines) - 281);
  assert.ok(stripe.every(l => Number.isInteger(l.unitCents) && l.unitCents >= 0 && l.quantity > 0));
});
test('3 × $10 with $1 off → 2 × $9.67 + 1 × $9.66', () => {
  const stripe = stripeLinesFor([{ productId: 'x', unitCents: 1000, quantity: 3, discountCents: 100 }]);
  assert.deepEqual(stripe.map(l => [l.quantity, l.unitCents]), [[2, 967], [1, 966]]);
});
test('same bag + same code → same signature; different price → different', () => {
  const a = shopSignature([{ productId: 'a', option: '', quantity: 1, unitCents: 1800 }], { codeId: 'h', discountCents: 180 });
  const b = shopSignature([{ productId: 'a', option: '', quantity: 1, unitCents: 1800 }], { codeId: 'h', discountCents: 180 });
  const c = shopSignature([{ productId: 'a', option: '', quantity: 1, unitCents: 2000 }], { codeId: 'h', discountCents: 180 });
  assert.equal(a, b); assert.notEqual(a, c);
});

// One-on-One / class codes: judged on the day the member claimed the use
// (server time), so a claim made after the end date is never honored.
const sCode = over => ({ scope: 'both', active: true, type: 'percent', amount: 20, expiresAt: '', ...over });
test('session code claimed on a valid day is honored', () => assert.equal(sessionDiscountProblem(sCode(), 'oneonone', '2026-11-18'), ''));
test('session code claimed on its last day is honored; the day after is not', () => {
  assert.equal(sessionDiscountProblem(sCode({ expiresAt: '2026-11-18' }), 'oneonone', '2026-11-18'), '');
  assert.equal(sessionDiscountProblem(sCode({ expiresAt: '2026-11-17' }), 'oneonone', '2026-11-18'), 'expired');
});
test('session code claimed before its start date is not honored', () => assert.equal(sessionDiscountProblem(sCode({ startsAt: '2026-11-19' }), 'teaching', '2026-11-18'), 'not-started'));
test('paused, wrong-kind, missing code or missing claim date is not honored', () => {
  assert.equal(sessionDiscountProblem(sCode({ active: false }), 'oneonone', '2026-11-18'), 'paused');
  assert.equal(sessionDiscountProblem(sCode({ scope: 'teaching' }), 'oneonone', '2026-11-18'), 'wrong-scope');
  assert.equal(sessionDiscountProblem(sCode({ scope: 'shop' }), 'teaching', '2026-11-18'), 'wrong-scope');
  assert.equal(sessionDiscountProblem(null, 'oneonone', '2026-11-18'), 'not-found');
  assert.equal(sessionDiscountProblem(sCode(), 'oneonone', ''), 'no-claim-date');
});

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
