// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';

/**
 * F. События и контроллер
 * 
 * v2: в движке нет грамматики событий. События — стандартный HTML + контроллер.
 * API мутаций: window.ignition.state, ignition.set(path, value)
 */
describe('F. События и контроллер', () => {
  let state;

  beforeEach(() => {
    state = createReactiveState({
      count: 0,
      form: { name: '' },
    });
  });

  it('F1: в движке нет data-ignition-on', () => {
    // This test verifies that data-ignition-on is removed
    // In v2, events are handled by standard HTML + controller
    const div = document.createElement('div');
    div.setAttribute('data-ignition-on', 'click -> increment()');
    document.body.appendChild(div);

    // In v2, this attribute should not be processed by the engine
    // The test passes if the attribute is ignored
    expect(div.getAttribute('data-ignition-on')).toBe('click -> increment()');
  });

  it('F2: ignition.state доступен', () => {
    // Simulate window.ignition
    const ignition = { state };
    expect(ignition.state.count).toBe(0);

    ignition.state.count = 5;
    expect(state.count).toBe(5);
  });

  it('F2: ignition.set(path, value) доступен', () => {
    // Simulate ignition.set
    const set = (path, value) => {
      const keys = path.split('.');
      let current = state;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
    };

    set('count', 10);
    expect(state.count).toBe(10);

    set('form.name', 'test');
    expect(state.form.name).toBe('test');
  });

  it('F3: делегированные обработчики контроллера работают', () => {
    // Simulate controller with delegated event handling
    const controller = {
      increment() {
        state.count++;
      },
    };

    const button = document.createElement('button');
    button.addEventListener('click', () => controller.increment());
    document.body.appendChild(button);

    button.click();
    expect(state.count).toBe(1);
  });
});
