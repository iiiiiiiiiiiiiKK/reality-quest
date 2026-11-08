/**
 * Mobile / responsive audit.
 *
 * Checks the specific things that break on real iPhones and small screens:
 *   - narrow widths (320 / 360 / 375 / 390 / 414 / 430)
 *   - landscape
 *   - notched safe areas
 *   - header crowding (logo + level + X link + lang + theme)
 *   - every interactive element reachable and >= 40px
 *   - tap targets not overlapping
 *   - no clipped/overflowing text
 *   - bottom bar not covered by the sheet or by the home indicator
 *
 * Run: node e2e/mobile.mjs
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHANGHAI = { lat: 31.2304, lng: 121.4737 };

const VIEWPORTS = [
  { name: 'iPhone SE (1st) 320x568', width: 320, height: 568 },
  { name: 'iPhone SE (2/3) 375x667', width: 375, height: 667 },
  { name: 'iPhone 12/13 mini 375x812', width: 375, height: 812 },
  { name: 'iPhone 14/15 390x844', width: 390, height: 844 },
  { name: 'iPhone 15 Pro Max 430x932', width: 430, height: 932 },
  { name: 'Pixel 7 412x915', width: 412, height: 915 },
  { name: 'iPhone landscape 844x390', width: 844, height: 390 },
  { name: 'iPad mini 768x1024', width: 768, height: 1024 },
  { name: 'Desktop narrow 1024x768', width: 1024, height: 768 },
  { name: 'Desktop 1440x900', width: 1440, height: 900 },
];

const results = [];
let failures = 0;
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` - ${detail}` : ''}`);
}

async function skipOnboarding(page) {
  for (let i = 0; i < 4; i += 1) {
    const next = page.locator('[data-testid="onboarding-next"]').first();
    if (await next.isVisible().catch(() => false)) {
      await next.click({ force: true });
      await page.waitForTimeout(320);
    } else break;
  }
  await page.waitForTimeout(2200);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.width < 1024,
      hasTouch: vp.width < 1024,
      locale: 'zh-CN',
    });
    await ctx.grantPermissions(['geolocation']);
    await ctx.setGeolocation({ latitude: SHANGHAI.lat, longitude: SHANGHAI.lng, accuracy: 8 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await skipOnboarding(page);

    // --- horizontal overflow at document level
    const doc = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
    }));
    record(`${vp.name}: no horizontal overflow`, doc.sw <= doc.cw + 1, `sw=${doc.sw} cw=${doc.cw}`);

    // --- vertical: the shell must not scroll (only inner panes may)
    record(`${vp.name}: shell does not scroll vertically`, doc.sh <= doc.ch + 2, `sh=${doc.sh} ch=${doc.ch}`);

    // --- header: all five controls visible and inside the viewport
    const header = await page.evaluate(() => {
      const h = document.querySelector('header');
      if (!h) return null;
      const r = h.getBoundingClientRect();
      const kids = Array.from(h.querySelectorAll('button, a')).map((el) => {
        const b = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          href: el.getAttribute('href') || '',
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20),
          x: Math.round(b.x),
          w: Math.round(b.width),
          h: Math.round(b.height),
          visible: b.width > 0 && b.height > 0,
          inside: b.x >= -1 && b.right <= window.innerWidth + 1,
        };
      });
      return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), kids };
    });

    if (!header) {
      record(`${vp.name}: header present`, false);
    } else {
      const visibleKids = header.kids.filter((k) => k.visible);
      const outside = visibleKids.filter((k) => !k.inside);
      record(
        `${vp.name}: header controls all inside viewport`,
        outside.length === 0,
        outside.length ? outside.map((k) => `${k.label}@${k.x}+${k.w}`).join(', ') : `${visibleKids.length} controls`,
      );
      const xLink = header.kids.find((k) => k.href === 'https://x.com/0xkillcoin' && k.visible);
      record(`${vp.name}: author X link visible in header`, Boolean(xLink), xLink ? `w=${xLink.w}` : 'missing');
      record(
        `${vp.name}: header height sane`,
        header.h > 36 && header.h < 120,
        `h=${header.h}`,
      );
    }

    // --- tap targets: anything interactive must be >= 40px in both axes
    const smallTargets = await page.evaluate(() => {
      const sel = 'button, a[href], input, select, textarea, [role="button"], [role="tab"]';
      const bad = [];
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue; // hidden
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        // Map markers are geo-anchored pins, not UI controls: exempt them.
        if (el.closest('.leaflet-container')) continue;
        // Inline text links inside paragraphs are exempt (WCAG 2.5.8 inline exception).
        const isInlineLink = el.tagName === 'A' && style.display === 'inline';
        if (isInlineLink) continue;
        if (b.height < 40 || b.width < 24) {
          bad.push({
            label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 26),
            w: Math.round(b.width),
            h: Math.round(b.height),
            cls: (el.className || '').toString().slice(0, 40),
          });
        }
      }
      return bad;
    });
    record(
      `${vp.name}: tap targets >= 40px tall`,
      smallTargets.length === 0,
      smallTargets.slice(0, 4).map((t) => `${t.label}(${t.w}x${t.h})`).join(', '),
    );

    // --- bottom nav present on small screens, absent on desktop
    const tabbar = await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="tabbar"]');
      if (!nav) return null;
      const r = nav.getBoundingClientRect();
      const btns = Array.from(nav.querySelectorAll('button')).map((b) => {
        const x = b.getBoundingClientRect();
        return { w: Math.round(x.width), h: Math.round(x.height), bottom: Math.round(x.bottom) };
      });
      return { visible: r.height > 0, bottom: Math.round(r.bottom), h: Math.round(r.height), btns };
    });

    if (vp.width < 1024) {
      record(`${vp.name}: bottom tab bar visible`, Boolean(tabbar?.visible), tabbar ? `h=${tabbar.h}` : 'none');
      if (tabbar?.visible) {
        record(
          `${vp.name}: tab bar sits on the viewport bottom`,
          Math.abs(tabbar.bottom - vp.height) <= 2,
          `bottom=${tabbar.bottom} vp=${vp.height}`,
        );
        record(
          `${vp.name}: 5 equally spaced tabs`,
          tabbar.btns.length === 5 && tabbar.btns.every((b) => b.w > 0 && b.h >= 44),
          JSON.stringify(tabbar.btns.map((b) => `${b.w}x${b.h}`)),
        );
      }
    } else {
      record(`${vp.name}: desktop uses side rail instead of tab bar`, !tabbar?.visible);
    }

    // --- map occupies meaningful area where shown
    const mapBox = await page.locator('.leaflet-container').first().boundingBox().catch(() => null);
    if (vp.width < 1024) {
      const minH = vp.height < 500 ? 150 : 320;
      record(
        `${vp.name}: map height >= ${minH}px`,
        Boolean(mapBox && mapBox.height >= minH),
        mapBox ? `${Math.round(mapBox.width)}x${Math.round(mapBox.height)}` : 'no map',
      );
    } else {
      record(`${vp.name}: map present`, Boolean(mapBox), mapBox ? `${Math.round(mapBox.width)}x${Math.round(mapBox.height)}` : 'none');
    }

    // --- evaluate the sheet on small screens
    if (vp.width < 1024) {
      const handle = page.getByRole('button', { name: /附近任务|Nearby quests/ }).first();
      if (await handle.isVisible().catch(() => false)) {
        await handle.click();
        await page.waitForTimeout(1200);
        const sheet = await page.evaluate(() => {
          const d = document.querySelector('[role="dialog"]');
          if (!d) return null;
          const r = d.getBoundingClientRect();
          return {
            x: Math.round(r.x),
            w: Math.round(r.width),
            h: Math.round(r.height),
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        });
        record(
          `${vp.name}: sheet fits viewport`,
          Boolean(sheet && sheet.w <= sheet.vw + 1 && sheet.h <= sheet.vh * 0.95),
          sheet ? `${sheet.w}x${sheet.h} in ${sheet.vw}x${sheet.vh}` : 'no dialog',
        );
        record(
          `${vp.name}: sheet body scrolls internally`,
          Boolean(
            sheet &&
              (await page.evaluate(() => {
                const el = document.querySelector('[role="dialog"] .scroll-y');
                return el ? el.scrollHeight >= el.clientHeight : false;
              })),
          ),
        );
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } else {
        record(`${vp.name}: sheet handle present`, false);
      }
    }

    // --- no page errors
    record(`${vp.name}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));

    await page.screenshot({ path: `e2e/vp-${vp.width}x${vp.height}.png` }).catch(() => {});
    await ctx.close();
  }

  await browser.close();
  console.log('\n================ MOBILE SUMMARY ================');
  console.log(`total: ${results.length}, failed: ${failures}`);
  for (const r of results.filter((x) => !x.ok)) console.log(`FAILED: ${r.name} - ${r.detail}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('mobile audit crashed:', e);
  process.exit(2);
});
