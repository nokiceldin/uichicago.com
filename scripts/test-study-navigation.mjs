import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.STUDY_TEST_URL || 'http://localhost:3100';
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/Maximum update depth|Too many re-renders/.test(message.text())) errors.push(message.text());
    });
    // Keep the regression independent of sign-in and remote services.
    await page.route('**/api/auth/session', route => route.fulfill({ json: {} }));
    await page.goto(`${baseURL}/study`);
    async function navigate(label, expected) {
      if (viewport.width < 1024) {
        await page.locator('header button:visible').filter({ has: page.locator('svg.lucide-menu') }).last().click();
      }
      if (label === 'UIChicago') {
        await page.locator(viewport.width < 1024 ? '[aria-hidden="false"] aside a[href="/"]' : 'header a[href="/"]').first().click();
      } else {
        await page.getByRole('link', { name: label, exact: true }).last().click();
      }
      await page.waitForURL(url => url.pathname + url.search === expected);
    }
    await navigate('Flashcards', '/study/create?type=flashcards');
    await page.getByPlaceholder('Title', { exact: true }).fill('Navigation regression');
    await page.waitForTimeout(500);
    assert.equal(await page.getByPlaceholder('Title', { exact: true }).inputValue(), 'Navigation regression');
    await page.getByRole('button', { name: 'Create', exact: true }).first().click();
    await page.getByRole('button', { name: 'Create', exact: true }).last().click();
    await page.waitForTimeout(500);
    await navigate('My library', '/study?view=library');
    await navigate('Study guides', '/study/create?type=guide');
    await page.getByRole('button', { name: 'Generate guide', exact: true }).click();
    await page.waitForTimeout(500);
    await navigate('Notes', '/study?mode=notes');
    await navigate('Study groups', '/study?screen=groups');
    await navigate('Home', '/study');
    await navigate('Flashcards', '/study/create?type=flashcards');
    await page.goBack();
    await page.waitForURL(`${baseURL}/study`);
    await page.goForward();
    await page.waitForURL(`${baseURL}/study/create?type=flashcards`);
    await navigate('UIChicago', '/');
    assert.deepEqual(errors, []);
    console.log(`PASS: ${viewport.width}px draft retention, invalid forms, sidebar navigation, browser history, UIC home`);
    await page.close();
  }
} finally {
  await browser.close();
}
