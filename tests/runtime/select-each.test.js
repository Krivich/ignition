// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { registerTemplate, resetRegistry } from '../../engine/core/runtime/render.js';
import { initBlocks, initBinding } from '../../engine/core/runtime/binding.js';

describe('select options via {{#each}} in blocks', () => {
  let state;

  beforeEach(() => {
    document.body.innerHTML = '';
    state = createReactiveState({
      reference: { industries: ['IT', 'Finance', 'Trade'] },
      form: { industry: '' }
    });
  });

  afterEach(() => {
    resetRegistry();
  });

  it('{{#each}} в блоке генерирует options, binding работает', () => {
    registerTemplate('test/select-block', (data) => {
      const options = data.reference.industries
        .map(item => `<option value="${item}">${item}</option>`)
        .join('');
      return `<select data-ignition-binding="form.industry">
        <option value="">Choose</option>
        ${options}
      </select>`;
    });

    document.body.innerHTML = `
      <div data-ignition-block="test/select-block"
           data-ignition-depends="reference">
      </div>
    `;

    initBlocks(state);

    // Binding works — initBinding after block renders the select
    const selectEl = document.querySelector('select');
    initBinding(state, selectEl);

    // Options rendered from {{#each}} equivalent
    const opts = selectEl.querySelectorAll('option');
    expect(opts).toHaveLength(4); // placeholder + 3 items
    expect(opts[1].textContent).toBe('IT');

    // Binding works — select value syncs with state
    selectEl.value = 'Finance';
    selectEl.dispatchEvent(new Event('change'));
    expect(state.form.industry).toBe('Finance');
  });

  it('блок перерисовывается при изменении items, binding сохраняется', () => {
    registerTemplate('test/select-block2', (data) => {
      const options = data.reference.industries
        .map(item => `<option value="${item}">${item}</option>`)
        .join('');
      return `<select data-ignition-binding="form.industry">
        <option value="">Choose</option>
        ${options}
      </select>`;
    });

    document.body.innerHTML = `
      <div data-ignition-block="test/select-block2"
           data-ignition-depends="reference">
      </div>
    `;

    initBlocks(state);

    expect(select().querySelectorAll('option')).toHaveLength(4);

    // Change the array — block re-renders
    state.reference.industries = ['A', 'B', 'C', 'D', 'E'];
    state.flush();

    const opts = select().querySelectorAll('option');
    expect(opts).toHaveLength(6); // placeholder + 5 items
    expect(opts[1].textContent).toBe('A');
  });

  function select() {
    return document.querySelector('select');
  }
});
