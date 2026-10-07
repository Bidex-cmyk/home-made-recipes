// P0 staging live smoke test — exercises the deployed staging app end-to-end via real DOM wiring.
// Usage: node scripts/p0-smoke-test.mjs
// Creates a throwaway account, verifies P0 flows, cleans up, logs out. Never touches production.
import puppeteer from 'puppeteer-core';

const BASE = 'https://home-made-recipe-c857f-staging.web.app';
const STAMP = Date.now();
const EMAIL = process.env.QA_EMAIL || `p0_smoke_${STAMP}@example.com`;
const PASS = 'P0smoke!test2026';
const results = [];
function ok(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Poll until fn returns truthy (or timeout) — avoids fixed-sleep races with 3s notification TTL
const waitFor = async (fn, timeoutMs = 10000, pollMs = 300, ...args) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const v = await page.evaluate(fn, ...args); if (v) return v; } catch (e) { /* page navigating */ }
    await sleep(pollMs);
  }
  return null;
};
// NOTE: page.evaluate cannot serialize closures. The pattern source must be passed
// as an argument, otherwise the RegExp is undefined in-page and every check silently
// times out (this made the cook/follow assertions report false failures).
const waitForNotification = (pattern, timeoutMs = 20000) =>
  waitFor(
    (src) => {
      const n = [...document.querySelectorAll('.notification')].pop();
      return n && new RegExp(src).test(n.innerText) ? n.innerText.trim() : null;
    },
    timeoutMs,
    250,
    pattern.source,
  );

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const pageErrors = [];
const consoleMsgs = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
const dumpDiag = async (label) => {
  const notifs = await page.evaluate(() => [...document.querySelectorAll('.notification')].map((n) => n.innerText.trim()));
  console.log(`   [diag:${label}] notifs=${JSON.stringify(notifs)}`);
  const recent = consoleMsgs.slice(-6).join(' || ');
  console.log(`   [diag:${label}] console: ${recent.slice(0, 500) || '(none)'}`);
};

// Helper: click via DOM (works for elements wired by the module)
const click = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (el) { el.click(); return true; }
  return false;
}, sel);
// Helper: last notification text
const lastNotification = () => page.evaluate(() => {
  const n = [...document.querySelectorAll('.notification')].pop();
  return n ? n.innerText.trim() : '';
});
// Open the account dropdown (avatar click) then an item
const dropdownGo = async (itemId) => {
  await click('#userProfile');
  await sleep(400);
  const opened = await click(`#${itemId}`);
  await sleep(800);
  return opened;
};

// ---------- 1. Unauthenticated load ----------
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(4000);

ok('page loads with title', (await page.title()).length > 0, await page.title());
ok('no JS parse/runtime errors on load', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));

// Age gate (fresh headless profile) — must be dismissible
const ageGateVisible = await page.evaluate(() => {
  const g = document.getElementById('ageGate');
  return g && getComputedStyle(g).display !== 'none';
});
if (ageGateVisible) { await click('#ageYes'); await sleep(800); }
ok('age gate handled', true, ageGateVisible ? 'was shown, accepted 18+' : 'not shown (already verified)');

// Parse blocker probe: clicking a save button while logged out must open the login modal
// (proves module executed and wired handleSaveButton → requireAuth → showLoginModal)
await click('.save-btn');
await sleep(800);
const loginProbe = await page.evaluate(() => !!document.querySelector('.modal.active #email'));
ok('module JS wired event handlers (login modal on save click)', loginProbe);
if (loginProbe) { await click('.modal.active .modal-close'); await sleep(500); }

// Fake notification badge must be hidden/absent when logged out
const badgeState = await page.evaluate(() =>
  [...document.querySelectorAll('.notification-badge')].map((b) => ({ text: b.textContent.trim(), display: getComputedStyle(b).display }))
);
ok('no visible fake notification badge', badgeState.every((b) => b.display === 'none' || b.text !== '10'), JSON.stringify(badgeState));

const bodyText = await page.evaluate(() => document.body.innerText);
ok('no "2.4k" fake stat', !bodyText.includes('2.4k'));
ok('no "340 creators" fake stat', !bodyText.includes('340'));

// Repo metadata must not be served (SPA fallback returns HTML, not JSON/markdown)
const probe = await page.evaluate(async () => {
  const out = {};
  for (const p of ['package.json', 'README.md', 'DEPLOYMENT.md', 'firestore.rules', 'QA_ACCOUNTS.md']) {
    try { const r = await fetch('/' + p); out[p] = r.headers.get('content-type') || ''; } catch (e) { out[p] = 'ERR'; }
  }
  return out;
});
ok('repo files not served as real files', Object.values(probe).every((ct) => !/json|markdown|octet/.test(ct)), JSON.stringify(probe));

// ---------- 2. Signup ----------
console.log('\n-- auth: signup --');
await click('#userProfile'); // logged out → opens login modal
await sleep(800);
await page.waitForSelector('.modal.active #email', { timeout: 10000 });
await page.type('.modal.active #email', EMAIL);
await page.type('.modal.active #password', PASS);
await click('.modal.active .signup-btn');
await sleep(8000);
const authed = await page.evaluate(() => {
  const av = document.getElementById('userProfile');
  return av && av.textContent.trim().length === 1; // onAuthStateChanged sets avatar to first letter
});
ok('signup + Firebase onAuthStateChanged drives UI avatar', authed, `email: ${EMAIL}`);

// ---------- 3. Saved recipes ----------
console.log('\n-- saved recipes --');
// Go to recipes tab and save the first Nigerian recipe
await click('.tab[data-tab="recipes"]');
await sleep(2000);
const rid = await page.evaluate(() => document.querySelector('#nigerianGrid .save-btn')?.dataset.recipe || null);
ok('recipe grid rendered with save buttons', !!rid, `recipeId=${rid}`);
await click(`#nigerianGrid .save-btn[data-recipe="${rid}"]`);
await sleep(3500);
// Check via Saved Recipes modal (Firestore-backed list)
await dropdownGo('savedRecipes');
await sleep(2000);
const savedCount = await page.evaluate(() => {
  const h = [...document.querySelectorAll('.modal.active h3')].find((x) => x.textContent.includes('Saved Recipes'));
  const m = h ? h.textContent.match(/Saved Recipes \((\d+)\)/) : null;
  return m ? parseInt(m[1], 10) : null;
});
ok('saved recipe listed in Firestore-backed modal', savedCount === 1, `count=${savedCount}`);
await click('.modal.active .modal-close');
await sleep(600);

// Hard refresh — Firestore authoritative restore
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
const savedActive = await page.evaluate((r) => !!document.querySelector(`.save-btn[data-recipe="${r}"].active`), rid);
ok('saved recipe restored from Firestore after refresh', savedActive);

// Unsave → verify removal after refresh
await click(`.save-btn[data-recipe="${rid}"]`);
await sleep(3500);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
const savedRemoved = await page.evaluate((r) => !document.querySelector(`.save-btn[data-recipe="${r}"].active`), rid);
ok('unsave persists after refresh', savedRemoved);
// Re-save for the logout/login check later
await click(`.save-btn[data-recipe="${rid}"]`);
await sleep(3500);

// ---------- 4. I Cooked This ----------
console.log('\n-- i cooked this --');
await click(`#nigerianGrid .view-recipe[data-recipe="${rid}"]`);
await sleep(2500);
const modalOpen = await page.evaluate(() => !!document.querySelector('.recipe-modal-overlay'));
ok('recipe modal opens', modalOpen);
// Cook it — poll for the confirmation notification (write = Firestore cooks doc)
await click('.recipe-modal-overlay [data-cooked]');
await sleep(2500);
// Debug: what does the cook confirm modal look like?
const cookModalDebug = await page.evaluate(() => ({
  hasOverlay: !!document.querySelector('.recipe-modal-overlay'),
  justCountBtn: !!document.getElementById('justCountCooked'),
  modalButtons: [...document.querySelectorAll('.recipe-modal-overlay button')].map((b) => b.id || b.textContent.trim().slice(0, 30)).slice(0, 10),
}));
console.log('   cook-modal debug:', JSON.stringify(cookModalDebug));
await click('#justCountCooked');
const cookNotif = await waitForNotification(/Cooked count updated/);
if (!cookNotif) await dumpDiag('cook');
ok('cook writes Firestore cooks doc', !!cookNotif, cookNotif || 'no notification within 6s');
// Close modal, reload, reopen → clicking again should REMOVE (proves persistence)
await page.evaluate(() => document.querySelector('.recipe-modal-overlay')?.remove());
await sleep(500);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
await click(`#nigerianGrid .view-recipe[data-recipe="${rid}"]`);
await sleep(2500);
await click('.recipe-modal-overlay [data-cooked]');
await sleep(2500);
await click('#justCountCooked');
const uncookNotif = await waitForNotification(/Removed your cook/);
ok('cooked state persisted (2nd click removes)', !!uncookNotif, uncookNotif || 'no notification within 6s');
// Re-cook to verify write path again
await click('.recipe-modal-overlay [data-cooked]');
await sleep(2500);
await click('#justCountCooked');
const reCookNotif = await waitForNotification(/Cooked count updated/);
await page.evaluate(() => document.querySelector('.recipe-modal-overlay')?.remove());
ok('re-cook works after uncook', !!reCookNotif, reCookNotif || 'no notification within 6s');
// Final cleanup: uncook
await click(`#nigerianGrid .view-recipe[data-recipe="${rid}"]`);
await sleep(2500);
await click('.recipe-modal-overlay [data-cooked]');
await sleep(2500);
await click('#justCountCooked');
await waitForNotification(/Removed your cook/);
await page.evaluate(() => document.querySelector('.recipe-modal-overlay')?.remove());

// ---------- 5. Meal planner ----------
console.log('\n-- meal planner --');
await click('.tab[data-tab="recipes"]');
await sleep(1500);
await click('[data-meal-key]');
await sleep(1500);
const picked = await click('[data-pick-recipe]');
await sleep(3500);
const planSet = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mealPlanV2') || '{}')).some(Boolean));
ok('meal plan slot set', picked && planSet);
await click('#clearMealPlan');
await sleep(3000);
const planClearedLocal = await page.evaluate(() => !Object.values(JSON.parse(localStorage.getItem('mealPlanV2') || '{}')).some(Boolean));
ok('clear plan empties plan locally', planClearedLocal);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
const planStillCleared = await page.evaluate(() => !Object.values(JSON.parse(localStorage.getItem('mealPlanV2') || '{}')).some(Boolean));
ok('cleared plan STAYS cleared after refresh (Firestore mealPlan/current deleted)', planStillCleared);

// ---------- 6. Shopping list ----------
console.log('\n-- shopping list --');
// Re-add a plan slot, then generate the shopping list from it
await click('.tab[data-tab="recipes"]');
await sleep(1500);
await click('[data-meal-key]');
await sleep(1500);
await click('[data-pick-recipe]');
await sleep(3500);
await click('#generateShoppingFromPlan');
await sleep(3000);
const shopCount = await page.evaluate(() => JSON.parse(localStorage.getItem('shoppingListV2') || '[]').length);
ok('shopping list generated from meal plan', shopCount > 0, `items=${shopCount}`);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
const shopPersist = await page.evaluate(() => JSON.parse(localStorage.getItem('shoppingListV2') || '[]').length);
ok('shopping list persists after refresh', shopPersist === shopCount, `after-refresh=${shopPersist}`);
// Cleanup shopping list + plan slot
await click('#clearList');
await sleep(2000);
await click('#clearMealPlan');
await sleep(2000);

// ---------- 7. Posts (creation + privacy) ----------
console.log('\n-- posts --');
await click('.nav-link.nav-link-create');
await sleep(1500);
const postModal = await page.evaluate(() => !!document.querySelector('#postCaption'));
ok('create post modal opens', postModal);
if (postModal) {
  await page.type('#postCaption', 'P0 smoke test post — staging only 🍲');
  await click('#submitPost');
  await sleep(6000);
  // Feed lives in the Social tab; check via Firestore-fed DOM
  await click('.tab[data-tab="social"]');
  await sleep(3000);
  const post = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#social-content .feed-post')].find((p) => p.innerText.includes('P0 smoke test post'));
    if (!el) return null;
    const author = el.querySelector('.author-name')?.textContent.trim() || '';
    return { author, isFirestore: el.dataset.firestore === 'true' };
  });
  ok('post created and rendered in feed', !!post, post ? JSON.stringify(post) : 'not found');
  ok('post author shown without email exposure', post && !post.author.includes('@'), `author="${post?.author}"`);
}

// ---------- 8. Follows ----------
console.log('\n-- follows --');
await click('.tab[data-tab="social"]');
await sleep(2000);
// Prefer a real Firestore-backed friend row (data-following-id) over the static demo rows.
const followSel = (await page.evaluate(() => !!document.querySelector('.friend-btn[data-following-id]')))
  ? '.friend-btn[data-following-id]'
  : '.friend-btn';
const before = await page.evaluate((s) => { const b = document.querySelector(s); if (!b) return null; const t = b.textContent.trim(); b.click(); return t; }, followSel);
const notif1 = await waitForNotification(/Following!|Unfollowed|Follow failed/);
const after1 = await waitFor((s) => { const b = document.querySelector(s); return b ? b.textContent.trim() : null; }, 8000, 300, followSel);
// A second click must toggle back — this proves a real reads/writes round-trip, not just a label.
await page.evaluate(() => document.querySelectorAll('.notification').forEach((n) => n.remove()));
await page.evaluate((s) => document.querySelector(s)?.click(), followSel);
const notif2 = await waitForNotification(/Following!|Unfollowed|Follow failed/);
if (!notif1 || !notif2) await dumpDiag('follow');
ok('follow toggle works (Firestore follows doc, toggles both ways)',
  !!before && !!notif1 && !!notif2 && !/failed/i.test(notif1) && !/failed/i.test(notif2) && notif1 !== notif2,
  `sel="${followSel}" before="${before}" after="${after1}" notif1="${notif1}" notif2="${notif2}"`);

// ---------- 9. Messaging ----------
console.log('\n-- messaging --');
await dropdownGo('messages');
await sleep(1500);
await click('#newMessage');
await sleep(1200);
const msgModal = await page.evaluate(() => !!document.querySelector('#newMsgTarget'));
ok('new message modal opens', msgModal);
if (msgModal) {
  // Recipient must be a real uid — the old name→uid QA map was removed in the P0
  // stabilization. Resolve a public user that isn't us via the public `users` read rule.
  const recipient = await page.evaluate(async () => {
    const self = localStorage.getItem('userUid');
    try {
      const r = await fetch('https://firestore.googleapis.com/v1/projects/home-made-recipe-c857f-staging/databases/(default)/documents/users?pageSize=10');
      const j = await r.json();
      for (const d of j.documents || []) {
        const id = String(d.name).split('/').pop();
        if (id && id !== self) return id;
      }
    } catch (e) { /* fall through */ }
    return null;
  });
  ok('resolved an existing recipient uid for messaging', !!recipient, String(recipient));
  await page.type('#newMsgTarget', recipient || '');
  await click('#startConvBtn');
  await sleep(3500);
  const chatReady = await page.evaluate(() => !!document.getElementById('messageInput'));
  ok('conversation started (chat input present)', chatReady);
  if (chatReady) {
    await page.type('#messageInput', 'P0 smoke message');
    await click('#sendMessage');
    const sent = await waitFor(() => document.getElementById('chat-messages')?.innerText.includes('P0 smoke message') || null, 20000);
    if (!sent) await dumpDiag('message');
    ok('message sent and displayed', !!sent);
  }
}

// ---------- 10. Profile editing ----------
console.log('\n-- profile editing --');
await dropdownGo('myAccount');
await sleep(1500);
const profileVisible = await page.evaluate(() => getComputedStyle(document.getElementById('profile-page')).display !== 'none');
ok('profile page loads', profileVisible);
await click('#editProfileBtn');
await sleep(1500);
const profileEdited = await page.evaluate(() => {
  const nameEl = document.querySelector('#editDisplayName');
  if (!nameEl) return false;
  nameEl.value = 'P0 Smoke Tester';
  document.getElementById('saveProfileBtn')?.click();
  return true;
});
await sleep(4500);
const profileName = await page.evaluate(() => document.getElementById('profileName')?.textContent.trim());
ok('profile display name saved + rendered', profileEdited && profileName === 'P0 Smoke Tester', `name="${profileName}"`);

// ---------- 11. My Videos ----------
console.log('\n-- my videos --');
await dropdownGo('myVideos');
await sleep(1500);
await click('#uploadNewVideo') || await click('#uploadFirstVideo');
await sleep(1500);
const videoModal = await page.evaluate(() => !!document.querySelector('#videoTitle2'));
ok('video URL modal opens', videoModal);
if (videoModal) {
  await page.type('#videoTitle2', 'P0 smoke video');
  await page.type('#videoUrl2', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await click('#submitVideoUrl');
  const videoSaved = await waitFor(() =>
    document.getElementById('videos-grid')?.innerText.includes('P0 smoke video') || null, 8000);
  ok('video saved (Firestore, URL-based)', !!videoSaved);
}

// ---------- 12. Lifestyle ----------
console.log('\n-- lifestyle --');
await dropdownGo('myLifestyle');
await sleep(1500);
(await click('#postNewLifestyle')) || (await click('#postFirstLifestyle'));
await sleep(1500);
const lifestyleModal = await page.evaluate(() => !!document.querySelector('#lifestyleCaption'));
ok('lifestyle modal opens', lifestyleModal);
if (lifestyleModal) {
  await page.type('#lifestyleCaption', 'P0 smoke lifestyle post — staging');
  await click('#submitLifestyle');
  const lsSaved = await waitFor(() =>
    document.getElementById('lifestyle-feed')?.innerText.includes('P0 smoke lifestyle post') || null, 8000);
  ok('lifestyle post saved', !!lsSaved);
}

// ---------- 13. Logout / login ----------
console.log('\n-- logout / login --');
await dropdownGo('logoutBtn');
await sleep(4000);
const loggedOut = await page.evaluate(() => {
  const av = document.getElementById('userProfile');
  return av && av.textContent.trim().length === 0; // icon restored
});
ok('logout restores logged-out UI', loggedOut);
// Login again — saved recipe must still be there (Firestore)
await click('#userProfile');
await sleep(800);
await page.waitForSelector('.modal.active #email', { timeout: 8000 });
await page.type('.modal.active #email', EMAIL);
await page.type('.modal.active #password', PASS);
await click('.modal.active .login-btn');
await sleep(8000);
await click('.tab[data-tab="recipes"]');
const savedAfterRelogin = await waitFor(
  (r) => {
    const b = document.querySelector(`.save-btn[data-recipe="${r}"]`);
    return b ? b.classList.contains('active') : null;
  },
  15000,
  500,
  rid,
);
ok('saved recipe still present after logout/login', savedAfterRelogin === true, `state=${savedAfterRelogin}`);
if (savedAfterRelogin !== true) await dumpDiag('relogin-save');

// Cleanup: unsave + logout
await click(`.save-btn[data-recipe="${rid}"]`);
await sleep(3000);
await dropdownGo('logoutBtn');
await sleep(2000);

// ---------- Summary ----------
const fails = results.filter((r) => !r.pass).length;
console.log(`\n== RESULT: ${results.length - fails}/${results.length} passed ==`);
if (pageErrors.length) console.log('page errors (informational):\n' + pageErrors.slice(0, 10).join('\n'));
await browser.close();
process.exit(fails ? 1 : 0);
