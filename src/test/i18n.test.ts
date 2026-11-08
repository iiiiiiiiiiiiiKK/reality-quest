import { describe, expect, it } from 'vitest';
import { messages, translate, pickLang, formatDate, AUTHOR } from '../lib/i18n';

describe('translate', () => {
  it('returns the localized string', () => {
    expect(translate('zh', 'navMap')).toBe('地图');
    expect(translate('en', 'navMap')).toBe('Map');
  });

  it('interpolates variables', () => {
    expect(translate('en', 'xpGained', { n: 50 })).toBe('+50 XP');
    expect(translate('zh', 'distance')).toBe('距离');
  });

  it('falls back to English then to the key', () => {
    expect(translate('zh', '__missing_key__')).toBe('__missing_key__');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(translate('en', 'requirementReach', {})).toContain('{n}');
  });

  it('has the same key set in both languages', () => {
    const zhKeys = Object.keys(messages.zh).sort();
    const enKeys = Object.keys(messages.en).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('has no empty translations', () => {
    for (const lang of ['zh', 'en'] as const) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(value.trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('pickLang', () => {
  it('prefers the requested language', () => {
    expect(pickLang({ zh: '中文', en: 'English' }, 'en')).toBe('English');
    expect(pickLang({ zh: '中文', en: 'English' }, 'zh')).toBe('中文');
  });

  it('falls back when one side is empty', () => {
    expect(pickLang({ zh: '', en: 'English' }, 'zh')).toBe('English');
  });

  it('handles undefined', () => {
    expect(pickLang(undefined, 'zh')).toBe('');
  });
});

describe('formatDate', () => {
  it('formats a timestamp', () => {
    const out = formatDate(Date.UTC(2025, 0, 15, 12, 0, 0), 'en');
    expect(out).toMatch(/2025/);
  });
  it('handles invalid input', () => {
    expect(formatDate(Number.NaN, 'en')).toBe('—');
  });
});

describe('author identity', () => {
  it('points at the required X profile', () => {
    expect(AUTHOR.url).toBe('https://x.com/0xkillcoin');
    expect(AUTHOR.handle).toBe('@0xkillcoin');
    expect(AUTHOR.glyph).toBe('𝕏');
  });
});
