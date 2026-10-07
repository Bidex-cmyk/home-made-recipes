// Captures browser console output, page errors and failed requests from a deployed app URL.
// Usage: node scripts/capture-console.js [url]
//   CHROME_PATH=/path/to/chrome node scripts/capture-console.js
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'https://home-made-recipe-c857f.web.app';
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';

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

  console.log('Navigating to', url);
  let status = 'n/a';
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    status = resp.status();
    console.log('HTTP status:', status);
  } catch (e) {
    console.error('Error loading page:', e.message);
  }

  // Wait a bit for async errors to surface.
  await new Promise((r) => setTimeout(r, 3000));
} finally {
  await browser.close();
}
