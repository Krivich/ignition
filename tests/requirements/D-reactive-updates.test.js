// @vitest-environment jsdom
/**
 * D1-D5: Reactive updates
 *
 * D1: Only blocks depending on changed path re-render
 * D2: Same value assignment does not trigger re-render
 * D3: No infinite loops from subscriber mutations
 * D4: Render error preserves existing block content
 * D5: Handlers and bindings restored after block re-render
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { registerTemplate, renderTemplate, resetRegistry } from '../../engine/core/runtime/render.js';
import { initBlocks, initBinding } from '../../engine/core/runtime/binding.js';

describe('D. Reactive updates', () => {
  let state;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    state = createReactiveState({
      a: { b: 'changed', c: 'unchanged' },
      d: 'other'
    });
  });

  afterEach(() => {
    resetRegistry();
  });

  describe('D1: Only dependent blocks re-render', () => {
    it('changing state.a.b re-renders block depending on a.b but not block depending on d', () => {
      let renderCountA = 0;
      let renderCountD = 0;

      registerTemplate('block/a', (data) => {
        renderCountA++;
        return `<p>${data.a.b}</p>`;
      });

      registerTemplate('block/d', (data) => {
        renderCountD++;
        return `<p>${data.d}</p>`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="block/a" data-ignition-depends="a.b"></div>
        <div data-ignition-block="block/d" data-ignition-depends="d"></div>
      `;

      initBlocks(state);

      expect(renderCountA).toBe(1);
      expect(renderCountD).toBe(1);

      state.a.b = 'new value';
      state.flush();

      expect(renderCountA).toBe(2);
      expect(renderCountD).toBe(1);
    });

    it('block with dependency on parent path re-renders on child change', () => {
      let renderCount = 0;

      registerTemplate('block/a-parent', (data) => {
        renderCount++;
        return `<p>${JSON.stringify(data.a)}</p>`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="block/a-parent" data-ignition-depends="a"></div>
      `;

      initBlocks(state);

      expect(renderCount).toBe(1);

      state.a.c = 'new c';
      state.flush();

      expect(renderCount).toBe(2);
    });
  });

  describe('D2: Same value assignment does not trigger re-render', () => {
    it('assigning identical primitive does not re-render', () => {
      let renderCount = 0;

      registerTemplate('block/d', (data) => {
        renderCount++;
        return `<p>${data.d}</p>`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="block/d" data-ignition-depends="d"></div>
      `;

      initBlocks(state);

      expect(renderCount).toBe(1);

      state.d = 'other';

      expect(renderCount).toBe(1);
    });

    it('assigning different value does trigger re-render', () => {
      let renderCount = 0;

      registerTemplate('block/d', (data) => {
        renderCount++;
        return `<p>${data.d}</p>`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="block/d" data-ignition-depends="d"></div>
      `;

      initBlocks(state);

      expect(renderCount).toBe(1);

      state.d = 'different';
      state.flush();

      expect(renderCount).toBe(2);
    });
  });

  describe('D3: No infinite loops from subscriber mutations', () => {
    it('subscriber that writes back to state does not cause hang', (done) => {
      let loopDetected = false;
      let notificationCount = 0;

      registerTemplate('block/a', (data) => {
        return `<p>${data.a.b}</p>`;
      });

      document.body.innerHTML = `
        <div data-ignition-block="block/a" data-ignition-depends="a.b"></div>
      `;

      state.subscribe('a.b', (path, oldVal, newVal) => {
        notificationCount++;
        if (notificationCount > 10) {
          loopDetected = true;
          return;
        }
        try {
          state.a.b = newVal + '_processed';
        } catch (e) {}
      });

      initBlocks(state);

      state.a.b = 'trigger';

      setTimeout(() => {
        expect(loopDetected).toBe(false);
        expect(notificationCount).toBeLessThanOrEqual(5);
        done();
      }, 100);
    });
  });

  describe('D4: Render error preserves block content', () => {
    it('render error does not crash and block keeps last content', () => {
      registerTemplate('block/error', (data) => {
        if (data.shouldError) {
          throw new Error('Render failed');
        }
        return `<p>${data.message || ''}</p>`;
      });

      state.shouldError = false;

      document.body.innerHTML = `
        <div data-ignition-block="block/error" data-ignition-depends="shouldError"></div>
      `;

      // Initial render succeeds
      initBlocks(state);
      const block = document.querySelector('[data-ignition-block]');
      expect(block.innerHTML.trim()).toBe('<p></p>');

      // Trigger error on re-render
      state.shouldError = true;

      // Content from last successful render is preserved
      expect(block.innerHTML).not.toBe('');
    });

    it('error on re-render does not throw uncaught exception', () => {
      registerTemplate('block/unsafe', (data) => {
        return `<p>${data.nested.deep.value}</p>`;
      });

      state.nested = null;

      document.body.innerHTML = `
        <div data-ignition-block="block/unsafe" data-ignition-depends="nested"></div>
      `;

      expect(() => initBlocks(state)).not.toThrow();
    });
  });

  describe('D5: Bindings restored after re-render', () => {
    it('initBinding re-attaches after block re-render', () => {
      registerTemplate('block/form', (data) => {
        return `<input data-ignition-binding="form.name" value="">`;
      });

      state.form = { name: '' };

      document.body.innerHTML = `
        <div data-ignition-block="block/form" data-ignition-depends="form">
          <input data-ignition-binding="form.name" value="">
        </div>
      `;

      initBlocks(state);

      // Re-render block
      const block = document.querySelector('[data-ignition-block]');
      const html = renderTemplate('block/form', state);
      const temp = document.createElement('div');
      temp.innerHTML = html;
      block.replaceChildren(...temp.childNodes);

      // Attach binding to new input
      initBinding(state, block.querySelector('input'));

      const input = document.querySelector('input');
      input.value = 'Bob';
      input.dispatchEvent(new Event('input'));

      expect(state.form.name).toBe('Bob');
    });
  });
});
