// Extracts inline <script type="module"> from index.html and runs node --check on it.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
if (scripts.length === 0) {
  console.error('FAIL: no <script type="module"> found in index.html');
  process.exit(1);
}
let allOk = true;
scripts.forEach((m, i) => {
  const code = m[1];
  const tmp = join(tmpdir(), `module-check-${i}.mjs`);
  writeFileSync(tmp, code);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    console.log(`OK: module script #${i} (${code.length} chars) parses cleanly`);
  } catch (e) {
    allOk = false;
    console.error(`FAIL: module script #${i}:\n${e.stderr?.toString() || e.message}`);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
});
process.exit(allOk ? 0 : 1);
