/**
 * Screenshot capture for README / social preview.
 *
 * Produces real screenshots of the running app (no mockups).
 * Run: node e2e/shots.mjs   (needs e2e/serve.mjs on BASE_URL)
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'docs/screenshots';

const SHANGHAI = { lat: 31.2304, lng: 121.4737 };

async function setup(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation({ latitude: SHANGHAI.lat, longitude: SHANGHAI.lng, accuracy: 8 });
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  // skip onboarding
  for (let i = 0; i < 4; i += 1) {
    const next = page.locator('[data-testid="onboarding-next"]').first();
    if (await next.isVisible().catch(() => false)) {
      await next.click({ force: true });
      await page.waitForTimeout(400);
    } else break;
  }
  // Wait for quest rows: discovery may need a real Overpass round trip, and
  // the screenshots must show populated content, not a skeleton.
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if ((await page.locator('ul li button').count()) > 0) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2500);
  return { ctx, page };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  /* --------------------------------------------------- desktop dark (zh) */
  {
    const { ctx, page } = await setup(browser, { viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    await page.screenshot({ path: `${OUT}/desktop-dark.png` });

    // quest detail
    const row = page.locator('ul li button').first();
    if (await row.isVisible().catch(() => false)) {
      await row.click({ force: true });
      const dialog = page.getByRole('dialog').first();
      await dialog.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/quest-detail.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    } else {
      console.log('WARN: no quest rows for quest-detail shot');
    }

    // language -> EN
    await page.locator('[data-testid="lang-toggle"]').click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/desktop-en.png` });

    // theme -> light
    await page.locator('[data-testid="theme-toggle"]').click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/desktop-light.png` });

    // footprints tab (desktop rail is the visible nav at this width)
    const rail = page.locator('nav[aria-label="desktop-nav"] button');
    await rail.nth(2).click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/footprints.png` });

    // profile tab
    await rail.nth(3).click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/profile.png` });

    await ctx.close();
  }

  /* ------------------------------------------------------ mobile dark (zh) */
  {
    const { ctx, page } = await setup(browser, {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'zh-CN',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await page.screenshot({ path: `${OUT}/mobile-map.png` });

    const handle = page.getByRole('button', { name: /附近任务|Nearby quests/ }).first();
    if (await handle.isVisible().catch(() => false)) {
      await handle.click();
      await page.waitForTimeout(1400);
      await page.screenshot({ path: `${OUT}/mobile-sheet.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }

    // quest detail on mobile
    const handle2 = page.getByRole('button', { name: /附近任务|Nearby quests/ }).first();
    if (await handle2.isVisible().catch(() => false)) {
      await handle2.click();
      await page.waitForTimeout(1400);
      const row = page.locator('[role="dialog"] ul li button').first();
      if (await row.isVisible().catch(() => false)) {
        await row.click({ force: true });
        await page.waitForTimeout(1600);
        await page.screenshot({ path: `${OUT}/mobile-quest.png` });
      } else {
        console.log('WARN: no quest rows on mobile for mobile-quest shot');
      }
    }

    await ctx.close();
  }

  await browser.close();
  console.log('screenshots written to', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
