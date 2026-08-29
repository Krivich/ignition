// @vitest-environment jsdom
/**
 * E2: extmob is a canonical v2 demo. No manual reflection, no visibility flags,
 * no setTimeout. Reactivity comes from delegated controllers + autobindings +
 * ephemeral. These tests boot the REAL built page (output/public/extmob/demo.html)
 * with the real runtime IIFE and controller, exactly as a browser would.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function built(rel) {
  return fs.readFileSync(path.join(ROOT, 'output', 'public', rel), 'utf8');
}

function runJs(source) {
  const fn = new Function(source);
  fn();
}

function runInlineScripts(html) {
  // Inline `<script>window.__IGNITION_X__ = ...;</script>` bodies don't execute
  // when innerHTML is assigned, so evaluate them explicitly (as a browser would).
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].includes('__IGNITION_')) runJs(m[1]);
  }
}

function typeInto(id, value) {
  const el = document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('E2: extmob v2 demo end-to-end (real build)', () => {
  let page;

  beforeAll(() => {
    page = built('extmob/demo.html');
  });

  beforeEach(() => {
    document.documentElement.innerHTML = page;
    runInlineScripts(page);
    // Load the self-hosted compiler exactly as a browser would (the renderer
    // injects /assets/handlebars.min.js as the first boot tag for live pages).
    runJs(built('assets/handlebars.min.js'));
    window.__IGNITION_STATE__ = undefined;
    runJs(built('assets/ignition-runtime.js'));
    if (!window.__IGNITION_STATE__) {
      document.dispatchEvent(new Event('DOMContentLoaded'));
    }
    runJs(built('assets/controllers/extmob.js'));
  });

  it('SSR content is present before any client re-render', () => {
    expect(document.querySelectorAll('.skill-row').length).toBe(2);
    expect(document.body.textContent).toContain('java');
    expect(document.querySelector('#toast').textContent.trim()).toBe('');
  });

  it('addSkillBtn mutates state → skills block re-renders, toast set via ephemeral', () => {
    typeInto('newSkillInput', 'docker');
    document.getElementById('addSkillBtn').click();

    const names = [...document.querySelectorAll('.skill-name')].map((n) => n.textContent);
    expect(names).toContain('docker');
    expect(document.querySelector('#toast').textContent).toContain('Добавлен навык: docker');
  });

  it('C5: delegation — N re-renders do not duplicate listeners (click fires exactly once)', () => {
    // Add two skills → two block re-renders.
    typeInto('newSkillInput', 'a');
    document.getElementById('addSkillBtn').click();
    typeInto('newSkillInput', 'b');
    document.getElementById('addSkillBtn').click();
    typeInto('newSkillInput', 'c');
    document.getElementById('addSkillBtn').click();

    const before = document.querySelectorAll('.skill-name').length;
    typeInto('newSkillInput', 'd');
    document.getElementById('addSkillBtn').click();
    const after = document.querySelectorAll('.skill-name').length;

    // Exactly one new row (no duplicated delegated handlers).
    expect(after - before).toBe(1);
  });

  it('checkbox and select bindings write to state (C4)', () => {
    const checkbox = document.querySelector('input[name="consent"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(window.__IGNITION_STATE__.candidate.consent).toBe(true);

    const select = document.querySelector('select[name="industry"]');
    const option = [...select.options].find((o) => o.value !== '');
    option.selected = true;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(window.__IGNITION_STATE__.candidate.industry).toBe(option.value);
  });
});
