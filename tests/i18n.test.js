import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import EN from '../src/lib/en.js';
import { deviceLang, setLang, t, tn } from '../src/lib/i18n.js';

/** Source files under dir, recursively. */
const files = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.jsx?$/.test(e.name) ? [join(dir, e.name)] : []));

/**
 * French keys passed to t() / tn() in the source: string literals inside the call that are
 * an argument or a ternary branch (preceded by "(", ",", "?" or ":"), not a comparison operand.
 */
export function usedKeys(src) {
  const keys = new Set();
  for (const m of src.matchAll(/\btn?\(/g)) {
    let depth = 0, i = m.index + m[0].length - 1, prev = '(';
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "'" || c === '"') {
        let j = i + 1, s = '';
        for (; src[j] !== c; j++) s += src[j] === '\\' ? src[++j] : src[j];
        if (depth === 1 && '(,?:'.includes(prev)) keys.add(s);
        i = j;
        prev = c;
      } else if (c === '`') {
        i = src.indexOf('`', i + 1); // template literals are never keys
        prev = c;
      } else if ('({['.includes(c)) { depth++; prev = c; }
      else if (')}]'.includes(c)) { if (--depth === 0) break; prev = c; }
      else if (!/\s/.test(c)) prev = c;
    }
  }
  return keys;
}

const KEYS = new Set([...files('src')].filter((f) => !f.endsWith('en.js')).flatMap((f) => [...usedKeys(readFileSync(f, 'utf8'))]));
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every French UI string has an English translation', () => {
  const missing = [...KEYS].filter((k) => !(k in EN));
  assert.deepEqual(missing, []);
});

test('English entries are all used and keep the placeholders', () => {
  assert.deepEqual(Object.keys(EN).filter((k) => !KEYS.has(k)), []);
  for (const [fr, en] of Object.entries(EN)) assert.deepEqual(vars(en), vars(fr), fr);
});

test('usedKeys skips comparison operands', () => {
  assert.deepEqual([...usedKeys("t(s === 'ask' ? 'Oui ?' : 'Non'), tn(n, '{n} jour', '{n} jours', { n })")], ['Oui ?', 'Non', '{n} jour', '{n} jours']);
});

test('t translates, fills placeholders and falls back to French', () => {
  setLang('en');
  assert.equal(t('Enregistrer'), EN.Enregistrer);
  assert.equal(t('pas une clé {x}', { x: 1 }), 'pas une clé 1');
  setLang('fr');
  assert.equal(t('Enregistrer'), 'Enregistrer');
  assert.equal(t('Vélo|matériel'), 'Vélo'); // context suffix dropped in French
});

test('tn follows each language plural rule', () => {
  setLang('fr');
  assert.equal(tn(0, '{n} jour', '{n} jours'), '0 jour');
  assert.equal(tn(2, '{n} jour', '{n} jours'), '2 jours');
  setLang('en');
  assert.equal(tn(0, '{n} jour', '{n} jours'), '0 days');
  assert.equal(tn(1, '{n} jour', '{n} jours'), '1 day');
  setLang('fr');
});

test('deviceLang picks French for fr-* only', () => {
  assert.equal(deviceLang(['fr-CA', 'en']), 'fr');
  assert.equal(deviceLang(['en-US', 'fr']), 'en');
  assert.equal(deviceLang([]), 'fr');
});
