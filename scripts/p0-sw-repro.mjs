// Minimal repro: does the service worker break Firestore writes?
import puppeteer from 'puppeteer-core';
const BASE = 'https://home-made-recipe-c857f-staging.web.app';
const EMAIL = `p0_swtest_${Date.now()}@example.com`;
const PASS = 'P0smoke!test2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const runCase = async (label, killSw) => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);
  if (killSw) {
    const killed = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
      await Promise.all(regs.map((r) => r.unregister()));
      return regs.length;
    });
    console.log(`${label}: unregistered ${killed} service worker(s)`);
  }
  // Age gate + signup
  await page.evaluate(() => { const g = document.getElementById('ageGate'); if (g && getComputedStyle(g).display !== 'none') document.getElementById('ageYes')?.click(); });
  await sleep(600);
  await page.evaluate(() => document.getElementById('userProfile')?.click());
  await sleep(1000);
  await page.waitForSelector('.modal.active #email', { timeout: 10000 });
  await page.type('.modal.active #email', EMAIL);
  await page.type('.modal.active #password', PASS);
  await page.evaluate(() => document.querySelector('.modal.active .signup-btn')?.click());
  await sleep(9000);
  // Check auth + Firestore write capability (save recipe = Firestore write)
  const state = await page.evaluate(() => ({
    authed: !!(window.auth && auth.currentUser),
    uid: window.auth && auth.currentUser ? auth.currentUser.uid : null,
    avatarLen: document.getElementById('userProfile')?.textContent.trim().length,
  }));
  // Try a save (Firestore write via wired save button)
  await page.evaluate(() => document.querySelector('.tab[data-tab="recipes"]')?.click());
  await sleep(2500);
  await page.evaluate(() => document.querySelector('#nigerianGrid .save-btn')?.click());
  await sleep(4000);
  const notif = await page.evaluate(() => [...document.querySelectorAll('.notification')].pop()?.innerText || '');
  const savedBtn = await page.evaluate(() => !!document.querySelector('#nigerianGrid .save-btn.active'));
  console.log(`${label}: authed=${state.authed} avatarLen=${state.avatarLen} saveNotif="${notif}" saveBtnActive=${savedBtn}`);
  console.log(`${label}: pageerrors: ${errs.length ? errs.slice(0, 3).join(' || ') : 'NONE'}`);
  await browser.close();
  return { label, authed: state.authed, saved: savedBtn, errs: errs.length };
};

const withSw = await runCase('WITH-SW ', false);
const noSw = await runCase('NO-SW   ', true);
console.log('\nSummary:', JSON.stringify({ withSw, noSw }, null, 2));
