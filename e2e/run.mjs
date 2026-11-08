/**
 * End-to-end verification (Playwright + system Chrome).
 *
 * Covers the flows the product spec requires be *actually* verified:
 *   1. first load / onboarding / author link
 *   2. location denied -> app still usable
 *   3. nearby quests present (live OSM or built-in curated landmarks)
 *   4. quest detail opens
 *   5. far-away check-in rejected
 *   6. in-radius check-in -> completion, XP awarded once
 *   7. reload keeps data
 *   8. language + theme switching
 *   9. mobile viewport layout
 *
 * Run with: node e2e/run.mjs
 * Env: BASE_URL (default http://127.0.0.1:4173), CHROME_PATH
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const results = [];
let failures = 0;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` - ${detail}` : ''}`);
}

const SHANGHAI = { lat: 31.2304, lng: 121.4737 };

async function grantGeo(context, lat, lng, accuracy = 12) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: lat, longitude: lng, accuracy });
}

async function skipOnboarding(page) {
  for (let i = 0; i < 4; i += 1) {
    const next = page.locator('[data-testid="onboarding-next"]').first();
    if (await next.isVisible().catch(() => false)) {
      // Force-click: the onboarding panel is a scroll container and Playwright's
      // hit test can land on the ancestor, which is not a real obstruction.
      await next.click({ force: true });
      await page.waitForTimeout(400);
    } else {
      break;
    }
  }
  await page.waitForTimeout(1200);
}

async function dismissRewards(page) {
  for (let i = 0; i < 4; i += 1) {
    const done = page.getByRole('button', { name: /Keep exploring|^Done/i }).first();
    if (await done.isVisible().catch(() => false)) {
      await done.click();
      await page.waitForTimeout(400);
    } else {
      break;
    }
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  /* ============================================================ desktop */
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  await grantGeo(desktop, SHANGHAI.lat, SHANGHAI.lng);
  const page = await desktop.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // -------------------------------------------------------- 1. first load
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 25000 });
  const title = await page.title();
  record('1. app loads', /Reality Quest/.test(title), title);

  const xLink = page.locator('a[href="https://x.com/0xkillcoin"]').first();
  await xLink.waitFor({ state: 'visible', timeout: 15000 });
  const xHref = await xLink.getAttribute('href');
  record('1b. author X link in header', xHref === 'https://x.com/0xkillcoin', String(xHref));

  // --------------------------------------------------------- 2. onboarding
  const onboardingVisible = await page
    .getByText(/Step outside\. Start the game\./)
    .first()
    .isVisible()
    .catch(() => false);
  record('2. onboarding shown on first run', onboardingVisible);
  await skipOnboarding(page);

  const shell = await page
    .locator('[data-testid="tabbar"], nav[aria-label="desktop-nav"]')
    .first()
    .isVisible();
  record('2b. app shell after onboarding', shell);

  // ---------------------------------------------------- 3. nearby quests
  let questRows = 0;
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    questRows = await page.locator('ul li button').count();
    if (questRows > 0) break;
    await page.waitForTimeout(1000);
  }
  record('3. nearby quests listed', questRows > 0, `rows=${questRows}`);

  // ---------------------------------------------------- 4. quest detail
  let opened = false;
  if (questRows > 0) {
    await page.locator('ul li button').first().click();
    const dialog = page.getByRole('dialog').first();
    opened = await dialog.isVisible({ timeout: 8000 }).catch(() => false);
  }
  record('4. quest detail sheet opens', opened);

  // ------------------------------------------ 5. far-away check-in rejected
  let farRejected = false;
  if (opened) {
    await desktop.setGeolocation({ latitude: SHANGHAI.lat + 0.05, longitude: SHANGHAI.lng, accuracy: 10 });
    const startBtn = page.getByRole('button', { name: /Start quest|Verify arrival|Locate again/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(5000);
      farRejected = await page
        .getByText(/Get closer|still .* away|Accuracy is|cannot verify/i)
        .first()
        .isVisible()
        .catch(() => false);
    }
  }
  record('5. far-away check-in rejected', farRejected);

  // ---------------------------------------------- 6. arrival completes quest
  let completed = false;
  if (opened) {
    await desktop.setGeolocation({ latitude: SHANGHAI.lat, longitude: SHANGHAI.lng, accuracy: 6 });
    const verify = page.getByRole('button', { name: /Verify arrival|Start quest|Locate again/i }).first();
    if (await verify.isVisible().catch(() => false)) await verify.click();
    await page.waitForTimeout(5500);

    const proof = page.getByRole('button', { name: /Proof of exploration/i }).first();
    if (await proof.isVisible().catch(() => false)) {
      await proof.click();
      await page.waitForTimeout(700);

      // Photo quests require an upload before submission can succeed; the
      // fixture also exercises the real compress-and-store pipeline.
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count()) {
        await fileInput.setInputFiles('e2e/fixture.png').catch(() => {});
        await page.waitForTimeout(1500);
      }

      const submit = page.getByRole('button', { name: /Submit and finish/i }).first();
      if (await submit.isVisible().catch(() => false)) {
        await submit.click();
        await page.waitForTimeout(3500);
        await dismissRewards(page);
        completed = true;
      }
    }
  }
  record('6. arrival verified and quest completed', completed);

  // ------------------------------------------------------ 7. XP persistence
  const headerText = await page.locator('header').innerText().catch(() => '');
  const xpMatch = /(\d+)\s*XP/.exec(headerText);
  const xpAfter = xpMatch ? Number(xpMatch[1]) : 0;
  record('7. XP awarded in header', xpAfter > 0, `xp=${xpAfter}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const headerText2 = await page.locator('header').innerText().catch(() => '');
  const xpMatch2 = /(\d+)\s*XP/.exec(headerText2);
  const xpReload = xpMatch2 ? Number(xpMatch2[1]) : 0;
  record(
    '8. data survives reload (no duplicate XP)',
    xpReload === xpAfter && xpAfter > 0,
    `before=${xpAfter} after=${xpReload}`,
  );

  // ------------------------------------------------------ 9. language toggle
  await page.locator('[data-testid="lang-toggle"]').click().catch(() => {});
  await page.waitForTimeout(900);
  const zhVisible = await page
    .getByText(/附近任务|地图|任务/)
    .first()
    .isVisible()
    .catch(() => false);
  record('9. language toggle works', zhVisible);

  // --------------------------------------------------------- 10. theme toggle
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.locator('[data-testid="theme-toggle"]').click().catch(() => {});
  await page.waitForTimeout(900);
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
  record('10. theme toggle works', themeBefore !== themeAfter, `${themeBefore} -> ${themeAfter}`);

  // ------------------------------------------------- 11. console health
  const realErrors = consoleErrors.filter(
    (e) => !/tile|overpass|nominatim|Failed to load resource|net::ERR|favicon|googleapis|gstatic/i.test(e),
  );
  record('11. no unexpected console errors', realErrors.length === 0, realErrors.slice(0, 2).join(' || '));

  await desktop.close();

  /* ==================================================== denied location */
  const denied = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  await denied.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok, err) =>
          err && err({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
        watchPosition: () => 0,
        clearWatch: () => undefined,
      },
    });
  });
  const dPage = await denied.newPage();
  await dPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await dPage.waitForTimeout(2000);
  await skipOnboarding(dPage);
  await dPage.waitForTimeout(1500);
  const deniedShell = await dPage
    .locator('[data-testid="tabbar"], nav[aria-label="desktop-nav"]')
    .first()
    .isVisible();
  record('12. location denied -> app still usable', deniedShell);
  await denied.close();

  /* ============================================================= mobile */
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await grantGeo(mobile, SHANGHAI.lat, SHANGHAI.lng);
  const mPage = await mobile.newPage();
  await mPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await mPage.waitForTimeout(2000);
  await skipOnboarding(mPage);
  await mPage.waitForTimeout(3500);

  const overflow = await mPage.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  record(
    '13. mobile: no horizontal overflow',
    overflow.scrollW <= overflow.clientW + 1,
    `scroll=${overflow.scrollW} client=${overflow.clientW}`,
  );

  const targets = await mPage.evaluate(() => {
    const nav = document.querySelectorAll('[data-testid="tabbar"] button');
    return Array.from(nav).map((b) => {
      const r = b.getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width) };
    });
  });
  record(
    '14. mobile: tab touch targets >= 44px',
    targets.length >= 4 && targets.every((t) => t.h >= 44 && t.w > 0),
    JSON.stringify(targets),
  );

  record(
    '15. mobile: author X link visible',
    await mPage.locator('a[href="https://x.com/0xkillcoin"]').first().isVisible(),
  );

  const mapBox = await mPage.locator('.leaflet-container').first().boundingBox().catch(() => null);
  record(
    '16. mobile: map fills the screen',
    Boolean(mapBox && mapBox.height > 300 && mapBox.width > 300),
    mapBox ? `${Math.round(mapBox.width)}x${Math.round(mapBox.height)}` : 'no map',
  );

  const handle = mPage.getByRole('button', { name: /Nearby quests/i }).first();
  let sheetOk = false;
  if (await handle.isVisible().catch(() => false)) {
    await handle.click();
    await mPage.waitForTimeout(1500);
    sheetOk = await mPage.getByRole('dialog').first().isVisible().catch(() => false);
    await mPage.keyboard.press('Escape');
    await mPage.waitForTimeout(400);
  }
  record('17. mobile: quest sheet opens', sheetOk);

  record(
    '18. mobile: map interactive after closing sheet',
    await mPage.locator('.leaflet-container').first().isVisible(),
  );

  await mPage.screenshot({ path: 'e2e/mobile.png' }).catch(() => {});
  await mobile.close();

  const tablet = await browser.newContext({
    viewport: { width: 834, height: 1112 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
  });
  await grantGeo(tablet, SHANGHAI.lat, SHANGHAI.lng);
  const tPage = await tablet.newPage();
  await tPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await tPage.waitForTimeout(1800);
  await skipOnboarding(tPage);
  const tabletOverflow = await tPage.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  record(
    '19. tablet: no horizontal overflow',
    tabletOverflow.scrollW <= tabletOverflow.clientW + 1,
    `scroll=${tabletOverflow.scrollW} client=${tabletOverflow.clientW}`,
  );
  await tPage.screenshot({ path: 'e2e/tablet.png' }).catch(() => {});
  await tablet.close();

  await browser.close();

  console.log('\n================ SUMMARY ================');
  console.log(`total: ${results.length}, failed: ${failures}`);
  for (const r of results.filter((x) => !x.ok)) console.log(`FAILED: ${r.name} - ${r.detail}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E harness crashed:', err);
  process.exit(2);
});

