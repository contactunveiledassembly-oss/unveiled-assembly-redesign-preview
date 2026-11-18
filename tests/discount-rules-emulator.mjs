// One-on-One / class discount codes — Firestore security rules against
// the local emulator (a `demo-` project: no real database or accounts).
//
//   firebase emulators:exec --project demo-unveiledassembly \
//     --only auth,firestore,storage,functions "node tests/discount-rules-emulator.mjs"
//
// Every write below is made the way a browser makes it (REST with the
// member's own sign-in token), so the rules decide. Covers: only the
// owner manages codes; a member can only reserve a use through a real
// ticket; the usage limit can't be passed, even by two claims racing;
// paused and Shop codes can't be claimed; ticket dates come from the
// server; a confirmed ticket can't be changed, released or reused; and
// members can't see each other's tickets.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const crypto = require('crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-unveiledassembly';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8180/v1/projects/${PROJECT}/databases/(default)/documents`;
const DOC = path => `projects/${PROJECT}/databases/(default)/documents/${path}`;

initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + (err && err.message ? err.message.split('\n')[0] : err)); }
}
async function user(email, role, uid){
  await getAuth().createUser({ uid, email, password: 'Password123' });
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Password123', returnSecureToken: true }) });
  const j = await r.json();
  await db.doc('users/' + uid).set({ email, role, name: email.split('@')[0] });
  return { uid, token: j.idToken };
}
const value = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(value) } } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } } : { stringValue: String(v) };
const fields = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, value(v)]));
// One atomic write as the signed-in browser would send it. `serverTime`
// lists fields set to the server's clock (the SDK's serverTimestamp()).
// `mask` = update only these fields (the SDK's updateDoc()).
function write(path, obj, { serverTime = [], mask = null } = {}){
  return { update: { name: DOC(path), fields: fields(obj) }, ...(mask ? { updateMask: { fieldPaths: mask } } : {}), ...(serverTime.length ? { updateTransforms: serverTime.map(f => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })) } : {}) };
}
async function commit(token, writes){
  const r = await fetch(`${FS}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ writes }) });
  return r.status;
}
async function rest(method, path, token){
  const r = await fetch(`${FS}/${path}`, { method, headers: token ? { Authorization: 'Bearer ' + token } : {} });
  return r.status;
}
const hash = code => crypto.createHash('sha256').update(code.trim().toUpperCase().replace(/\s+/g, '')).digest('hex');
async function seedCode(code, over = {}){
  const id = hash(code);
  await db.doc('discountCodes/' + id).set({ code, type: 'percent', amount: 20, scope: 'both', active: true, expiresAt: '', maxUses: null, usedCount: 0, redeemedSourceIds: [], lastRedeemedSourceId: null, ...over });
  return id;
}
const codeData = async id => (await db.doc('discountCodes/' + id).get()).data();
let seq = 0;
// The browser's claim: 1) create its own 'claimed' ticket, 2) +1 use.
async function claim(member, codeId, { ticketId = 'tkt-' + (++seq) } = {}){
  const t = await commit(member.token, [write('discountRedemptions/' + ticketId, { uid: member.uid, codeId, status: 'claimed', sourceCollection: null, sourceId: null }, { serverTime: ['createdAt'] })]);
  if(t !== 200) return { ticket: t, use: null, ticketId };
  const cur = await codeData(codeId);
  const use = await commit(member.token, [write('discountCodes/' + codeId, { usedCount: cur.usedCount + 1, redeemedSourceIds: [...cur.redeemedSourceIds, ticketId], lastRedeemedSourceId: ticketId }, { mask: ['usedCount', 'redeemedSourceIds', 'lastRedeemedSourceId'] })]);
  return { ticket: t, use, ticketId };
}

const owner = await user('owner@example.com', 'admin', 'owner-1');
const memberA = await user('a@example.com', 'member', 'member-a');
const memberB = await user('b@example.com', 'member', 'member-b');

// ---- owner controls ----
await test('owner can create, edit, pause and delete a code', async () => {
  const id = hash('OWNERCODE');
  const base = { code: 'OWNERCODE', type: 'percent', amount: 15, scope: 'both', active: true, expiresAt: '2026-12-31', maxUses: 3, usedCount: 0, redeemedSourceIds: [], lastRedeemedSourceId: null };
  assert.equal(await commit(owner.token, [write('discountCodes/' + id, base, { serverTime: ['updatedAt'] })]), 200);
  assert.equal(await commit(owner.token, [write('discountCodes/' + id, { ...base, amount: 25 }, { serverTime: ['updatedAt'] })]), 200);
  assert.equal(await commit(owner.token, [write('discountCodes/' + id, { active: false }, { mask: ['active'] })]), 200);
  assert.equal((await codeData(id)).amount, 25);
  assert.equal((await codeData(id)).active, false);
  assert.equal(await rest('DELETE', 'discountCodes/' + id, owner.token), 200);
  assert.equal((await db.doc('discountCodes/' + id).get()).exists, false);
});
await test('members cannot create, edit, delete or list codes', async () => {
  const id = await seedCode('NOTYOURS', { maxUses: 5 });
  assert.equal(await commit(memberA.token, [write('discountCodes/' + hash('MYOWN100'), { code: 'MYOWN100', type: 'percent', amount: 100, scope: 'both', active: true, usedCount: 0, redeemedSourceIds: [], maxUses: null })]), 403);
  assert.equal(await commit(memberA.token, [write('discountCodes/' + id, { amount: 100 }, { mask: ['amount'] })]), 403);
  assert.equal(await commit(memberA.token, [write('discountCodes/' + id, { maxUses: 999 }, { mask: ['maxUses'] })]), 403);
  assert.equal(await commit(memberA.token, [write('discountCodes/' + id, { active: true, expiresAt: '' }, { mask: ['active', 'expiresAt'] })]), 403);
  assert.equal(await rest('DELETE', 'discountCodes/' + id, memberA.token), 403);
  assert.equal(await rest('GET', 'discountCodes', memberA.token), 403);
  assert.equal(await rest('GET', 'discountCodes/' + id, memberA.token), 200, 'one exact code can be looked up at checkout');
});
await test('a member cannot add a use without a ticket, or lower the count', async () => {
  const id = await seedCode('NOTICKET', { maxUses: 2 });
  assert.equal(await commit(memberA.token, [write('discountCodes/' + id, { usedCount: 1 }, { mask: ['usedCount'] })]), 403);
  assert.equal(await commit(memberA.token, [write('discountCodes/' + id, { usedCount: 1, redeemedSourceIds: ['made-up'], lastRedeemedSourceId: 'made-up' }, { mask: ['usedCount', 'redeemedSourceIds', 'lastRedeemedSourceId'] })]), 403);
  await db.doc('discountCodes/' + id).update({ usedCount: 2, redeemedSourceIds: ['x1', 'x2'] });
  assert.equal(await commit(memberA.token, [write('discountCodes/' + id, { usedCount: 0, redeemedSourceIds: [] }, { mask: ['usedCount', 'redeemedSourceIds'] })]), 403);
});

// ---- claims and the usage limit ----
await test('a real claim reserves one use', async () => {
  const id = await seedCode('CLAIMME', { maxUses: 2 });
  const r = await claim(memberA, id);
  assert.deepEqual([r.ticket, r.use], [200, 200]);
  const c = await codeData(id);
  assert.equal(c.usedCount, 1); assert.deepEqual(c.redeemedSourceIds, [r.ticketId]);
});
await test('usage limit cannot be passed', async () => {
  const id = await seedCode('ONEUSE', { maxUses: 1 });
  assert.equal((await claim(memberA, id)).use, 200);
  const second = await claim(memberB, id);
  assert.equal(second.use, 403);
  assert.equal((await codeData(id)).usedCount, 1);
});
await test('two claims racing for the last use: only one wins', async () => {
  const id = await seedCode('RACEME', { maxUses: 1 });
  const ta = 'race-a', tb = 'race-b';
  for(const [m, t] of [[memberA, ta], [memberB, tb]]){
    assert.equal(await commit(m.token, [write('discountRedemptions/' + t, { uid: m.uid, codeId: id, status: 'claimed', sourceCollection: null, sourceId: null }, { serverTime: ['createdAt'] })]), 200);
  }
  // Both computed their write from the same starting state (usedCount 0).
  const mk = t => write('discountCodes/' + id, { usedCount: 1, redeemedSourceIds: [t], lastRedeemedSourceId: t }, { mask: ['usedCount', 'redeemedSourceIds', 'lastRedeemedSourceId'] });
  const statuses = await Promise.all([commit(memberA.token, [mk(ta)]), commit(memberB.token, [mk(tb)])]);
  assert.deepEqual(statuses.sort(), [200, 403]);
  const c = await codeData(id);
  assert.equal(c.usedCount, 1); assert.equal(c.redeemedSourceIds.length, 1);
});
await test('a paused code cannot be claimed', async () => {
  const id = await seedCode('PAUSEDNOW', { active: false });
  assert.equal((await claim(memberA, id)).ticket, 403);
  // even with a ticket made while it was active
  await db.doc('discountCodes/' + id).update({ active: true });
  const t = 'paused-tkt';
  assert.equal(await commit(memberA.token, [write('discountRedemptions/' + t, { uid: memberA.uid, codeId: id, status: 'claimed', sourceCollection: null, sourceId: null }, { serverTime: ['createdAt'] })]), 200);
  await db.doc('discountCodes/' + id).update({ active: false });
  assert.equal(await commit(memberA.token, [write('discountCodes/' + id, { usedCount: 1, redeemedSourceIds: [t], lastRedeemedSourceId: t }, { mask: ['usedCount', 'redeemedSourceIds', 'lastRedeemedSourceId'] })]), 403);
});
await test('Shop codes can only be reserved by the checkout server', async () => {
  const id = await seedCode('SHOPONLY', { scope: 'shop' });
  assert.equal((await claim(memberA, id)).ticket, 403);
});
await test('a ticket cannot be backdated, pre-confirmed, carry extra fields or name someone else', async () => {
  const id = await seedCode('TICKETS');
  const base = { uid: memberA.uid, codeId: id, status: 'claimed', sourceCollection: null, sourceId: null };
  assert.equal(await commit(memberA.token, [write('discountRedemptions/backdated', { ...base, createdAt: new Date('2026-01-01T12:00:00Z') })]), 403);
  assert.equal(await commit(memberA.token, [write('discountRedemptions/no-date', base)]), 403);
  assert.equal(await commit(memberA.token, [write('discountRedemptions/preconfirmed', { ...base, status: 'confirmed' }, { serverTime: ['createdAt'] })]), 403);
  assert.equal(await commit(memberA.token, [write('discountRedemptions/extra', { ...base, discountCents: 99999 }, { serverTime: ['createdAt'] })]), 403);
  assert.equal(await commit(memberA.token, [write('discountRedemptions/forB', { ...base, uid: memberB.uid }, { serverTime: ['createdAt'] })]), 403);
  assert.equal(await commit(memberA.token, [write('discountRedemptions/unknown-code', { ...base, codeId: hash('NOPE') }, { serverTime: ['createdAt'] })]), 403);
  assert.equal(await commit(null, [write('discountRedemptions/signed-out', base, { serverTime: ['createdAt'] })]), 403);
});

// ---- release, confirm, and locking ----
await test('a failed booking gives its use back; a claim cannot be released twice', async () => {
  const id = await seedCode('GIVEBACK', { maxUses: 1 });
  const r = await claim(memberA, id);
  const rel = write('discountCodes/' + id, { usedCount: 0, redeemedSourceIds: [], lastReleasedSourceId: r.ticketId }, { mask: ['usedCount', 'redeemedSourceIds', 'lastReleasedSourceId'] });
  assert.equal(await commit(memberB.token, [rel]), 403, 'someone else cannot release it');
  assert.equal(await commit(memberA.token, [rel]), 200);
  assert.equal(await rest('DELETE', 'discountRedemptions/' + r.ticketId, memberA.token), 200);
  assert.equal((await codeData(id)).usedCount, 0);
  assert.equal(await commit(memberA.token, [rel]), 403, 'no second release');
});
await test('confirming needs the member’s own booking that names the code', async () => {
  const id = await seedCode('CONFIRMME');
  const r = await claim(memberA, id);
  await db.doc('bookings/bk-a').set({ uid: memberA.uid, discountCode: 'CONFIRMME', status: 'pending' });
  await db.doc('bookings/bk-b').set({ uid: memberB.uid, discountCode: 'CONFIRMME', status: 'pending' });
  await db.doc('bookings/bk-a-nocode').set({ uid: memberA.uid, discountCode: null, status: 'pending' });
  const conf = src => write('discountRedemptions/' + r.ticketId, { status: 'confirmed', sourceCollection: 'bookings', sourceId: src }, { mask: ['status', 'sourceCollection', 'sourceId', 'confirmedAt'], serverTime: ['confirmedAt'] });
  assert.equal(await commit(memberA.token, [conf('bk-b')]), 403, 'not someone else’s booking');
  assert.equal(await commit(memberA.token, [conf('bk-a-nocode')]), 403, 'not a booking without the code');
  assert.equal(await commit(memberB.token, [conf('bk-b')]), 403, 'not someone else’s ticket');
  assert.equal(await commit(memberA.token, [conf('bk-a')]), 200);
});
await test('a confirmed ticket cannot be changed, deleted or released for reuse', async () => {
  const id = await seedCode('LOCKEDIN', { maxUses: 1 });
  const r = await claim(memberA, id);
  await db.doc('bookings/bk-locked').set({ uid: memberA.uid, discountCode: 'LOCKEDIN', status: 'pending' });
  assert.equal(await commit(memberA.token, [write('discountRedemptions/' + r.ticketId, { status: 'confirmed', sourceCollection: 'bookings', sourceId: 'bk-locked' }, { mask: ['status', 'sourceCollection', 'sourceId', 'confirmedAt'], serverTime: ['confirmedAt'] })]), 200);
  assert.equal(await commit(memberA.token, [write('discountRedemptions/' + r.ticketId, { status: 'claimed' }, { mask: ['status'] })]), 403);
  assert.equal(await commit(memberA.token, [write('discountRedemptions/' + r.ticketId, { sourceId: 'bk-other' }, { mask: ['sourceId'] })]), 403);
  assert.equal(await rest('DELETE', 'discountRedemptions/' + r.ticketId, memberA.token), 403);
  assert.equal(await commit(memberA.token, [write('discountCodes/' + id, { usedCount: 0, redeemedSourceIds: [], lastReleasedSourceId: r.ticketId }, { mask: ['usedCount', 'redeemedSourceIds', 'lastReleasedSourceId'] })]), 403);
  assert.equal((await codeData(id)).usedCount, 1);
});
await test('members see only their own tickets; the owner sees all', async () => {
  const id = await seedCode('PRIVATE');
  const r = await claim(memberA, id);
  assert.equal(await rest('GET', 'discountRedemptions/' + r.ticketId, memberA.token), 200);
  assert.equal(await rest('GET', 'discountRedemptions/' + r.ticketId, memberB.token), 403);
  assert.equal(await rest('GET', 'discountRedemptions/' + r.ticketId, null), 403);
  assert.equal(await rest('GET', 'discountRedemptions/' + r.ticketId, owner.token), 200);
});

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
