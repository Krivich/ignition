// @vitest-environment jsdom
/**
 * C1-C3: Client hydration
 *
 * C1: Client doesn't re-render server-filled blocks — attaches subscriptions
 * C2: Client distinguishes server-filled vs empty blocks
 * C3: Handlers work for both server-filled and client-rendered blocks
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { registerTemplate, resetRegistry } from '../../engine/core/runtime/render.js';
import { initBlocks, initBinding } from '../../engine/core/runtime/binding.js';

describe('C. Client hydration', () => {
  let state;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    state = createReactiveState({ message: 'from data', form: { name: 'Alice' } });
  });

  afterEach(() => {
    resetRegistry();
  });

  describe('C1: Client attaches to existing DOM, does not re-render', () => {
    it('server-filled block innerHTML is preserved after initBlocks', () => {
      registerTemplate('catalog/list', (data) => {
        return data.products.map(p => `<div class="product">${p}</div>`).join('');
      });

      document.body.innerHTML = `
        <div data-ignition-block="catalog/list" data-ignition-depends="products">
          <div class="product">Book 1</div>
          <div class="product">Book 2</div>
        </div>
      `;

      const block = document.querySelector('[data-ignition-block]');
      const contentBefore = block.innerHTML.trim();

      initBlocks(state);

      // C1: initBlocks should NOT replace server-filled content
      expect(block.innerHTML.trim()).toBe(contentBefore);
    });

    it('no visual flicker — DOM nodes are not replaced', () => {
      registerTemplate('test/block', (data) => {
        return `<p>${data.message}</p>`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="test/block" data-ignition-depends="message">
          <p>original</p>
        </div>
      `;

      const block = document.querySelector('[data-ignition-block]');
      const childNodes = block.childNodes.length;
      const contentBefore = block.innerHTML.trim();

      initBlocks(state);

      expect(block.childNodes.length).toBe(childNodes);
      expect(block.innerHTML.trim()).toBe(contentBefore);
    });

    it('subscribers are attached — changing state triggers re-render', () => {
      registerTemplate('test/block', (data) => {
        return `<p>${data.message}</p>`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="test/block" data-ignition-depends="message">
          <p>server value</p>
        </div>
      `;

      initBlocks(state);

      expect(document.querySelector('[data-ignition-block]').innerHTML.trim()).toBe('<p>server value</p>');

      // Changing state triggers re-render
      state.message = 'changed';
      expect(document.querySelector('[data-ignition-block]').innerHTML).toContain('changed');
    });
  });

  describe('C2: Client distinguishes empty vs filled blocks', () => {
    it('filled block is not re-rendered on init', () => {
      registerTemplate('test/block', (data) => {
        return `<p>${data.message}</p>`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="test/block" data-ignition-depends="message">
          <p>from server</p>
        </div>
      `;

      initBlocks(state);

      expect(document.querySelector('[data-ignition-block]').innerHTML.trim()).toBe('<p>from server</p>');
    });

    it('empty block is rendered by client when data is available', () => {
      registerTemplate('test/block', (data) => {
        return `<p>${data.message}</p>`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="test/block" data-ignition-depends="message">
        </div>
      `;

      initBlocks(state);

      const content = document.querySelector('[data-ignition-block]').innerHTML;
      expect(content).toContain('from data');
    });
  });

  describe('C3: Handlers work for both server-filled and client-rendered blocks', () => {
    it('binding syncs initial value from state to input', () => {
      registerTemplate('test/form', (data) => {
        return `<input data-ignition-binding="form.name">`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="test/form" data-ignition-depends="form">
          <input data-ignition-binding="form.name">
        </div>
      `;

      initBlocks(state);

      const input = document.querySelector('input');
      expect(input.value).toBe('Alice');
    });
  });
});
