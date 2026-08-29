// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const BUNDLE = path.join(projectRoot, 'engine', 'core', 'assets', 'ignition-runtime.js');

async function bootRuntime(initialData) {
  // jsdom exposes window/document/Handlebars as globals. Point the runtime at the
  // jsdom document and evaluate the IIFE bundle.
  window.__IGNITION_INITIAL_DATA__ = initialData;
  window.__IGNITION_TEMPLATES__ = {};
  const source = await fs.readFile(BUNDLE, 'utf8');
  const initFn = new Function('window', 'document', source);
  initFn(window, document);
}

afterEach(() => {
  delete window.__IGNITION_INITIAL_DATA__;
  delete window.__IGNITION_TEMPLATES__;
  delete window.__IGNITION_STATE__;
  delete window.ignition;
  document.body.innerHTML = '';
});

describe('H-v2: window.ignition.controller — контроллер страницы', () => {
  it('controller() регистрирует контроллер, который мутирует state (state', async () => {
    await bootRuntime({ cart: { items: [] } });

    let captured;
    window.ignition.controller((state, api) => {
      captured = { state, api };
    });

    expect(captured).toBeTruthy();
    // контроллер — единственный «кто меняет модель»
    captured.state.cart.items.push({ id: 1 });
    expect(captured.state.cart.items).toHaveLength(1);
  });

  it('controller() даёт api с нужными методами', async () => {
    await bootRuntime({});

    let api;
    window.ignition.controller((state, a) => { api = a; });

    expect(typeof api.ephemeral === 'undefined').toBe(true);
    expect(typeof api.computed).toBe('function');
    expect(typeof api.registerTemplate).toBe('function');
    expect(typeof api.registerHelper).toBe('function');
    expect(typeof api.loadDataset).toBe('function');
    expect(api.blockOptions).toBeTruthy();
  });

  it('не валидный контроллер игнорируется', async () => {
    await bootRuntime({});
    expect(() => window.ignition.controller(null)).not.toThrow();
    expect(() => window.ignition.controller('nope')).not.toThrow();
  });
});
