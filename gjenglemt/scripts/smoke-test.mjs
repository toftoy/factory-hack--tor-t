import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({
  configFile: new URL('../vite.config.ts', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname,
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) {
  throw new Error('Vite dev server did not report a local URL');
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
try {
  const page = await browser.newPage();
  await page.goto(url);
  const button = await page.waitForSelector('button', { timeout: 10_000 });
  const text = (await button.textContent())?.trim();
  if (text !== 'Ta bilde av lappen') {
    throw new Error(`Expected first button to say "Ta bilde av lappen", got "${text}"`);
  }
  console.log('Smoke test passed: capture screen renders with the expected button.');
} finally {
  await browser.close();
  await server.close();
}
