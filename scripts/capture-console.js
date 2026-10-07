// Captures browser console output, page errors and failed requests from a deployed app URL.
// Usage: node scripts/capture-console.js [url]
//   CHROME_PATH=/path/to/chrome node scripts/capture-console.js
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'https://home-made-recipe-c857f.web.app';

// puppeteer-core ships no browser, so resolve one. CHROME_PATH wins; otherwise fall
// back across common Linux (CI) / macOS locations.
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error(`No Chrome/Chromium found. Tried:\n  ${CANDIDATES.join('\n  ')}\nSet CHROME_PATH to your browser binary.`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();

  page.on('console', (msg) => {
    console.log(`[console:${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    console.log('[pageerror]', err.toString());
  });

  page.on('requestfailed', (req) => {
    console.log('[requestfailed]', req.url(), req.failure()?.errorText || '');
  });

  console.log('Navigating to', url, 'using', executablePath);
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('HTTP status:', resp.status());
  } catch (e) {
    console.error('Error loading page:', e.message);
  }

  // Wait a bit for async errors to surface.
  await new Promise((r) => setTimeout(r, 3000));
} finally {
  await browser.close();
}
