// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';
import { initBinding, resetActions } from '../../engine/core/runtime/binding.js';

/**
 * E. Биндинги и проекции (v2: автобиндинги)
 * 
 * v2: автобиндинги через value="{{path}}" и checked="{{path}}"
 * Точечные проекции: data-ignition-text, data-ignition-class, data-ignition-attr-*
 */
describe('E. Биндинги и проекции (v2)', () => {
  let state;

  beforeEach(() => {
    state = createReactiveState({
      form: { name: '', agree: false },
      ui: { active: false, count: 5 },
    });
  });

  afterEach(() => {
    resetActions();
  });

  it('E1: input value="{{path}}": ввод пишет в стейт', () => {
    const input = document.createElement('input');
    input.setAttribute('value', '{{form.name}}');
    input.setAttribute('data-ignition-path', 'form.name');
    document.body.appendChild(input);

    initBinding(state, input);

    input.value = 'test';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(state.form.name).toBe('test');
  });

  it('E1: программная мутация пишет в элемент без прыжка курсора', () => {
    const input = document.createElement('input');
    input.setAttribute('value', '{{form.name}}');
    input.setAttribute('data-ignition-path', 'form.name');
    document.body.appendChild(input);

    initBinding(state, input);

    state.form.name = 'updated';
    expect(input.value).toBe('updated');
  });

  it('E2: checkbox checked="{{path}}" (boolean)', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('checked', '{{form.agree}}');
    checkbox.setAttribute('data-ignition-path', 'form.agree');
    document.body.appendChild(checkbox);

    initBinding(state, checkbox);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(state.form.agree).toBe(true);
  });

  it('E5: data-ignition-text обновляется точечно', () => {
    const span = document.createElement('span');
    span.setAttribute('data-ignition-text', 'ui.count');
    document.body.appendChild(span);

    initBinding(state, span);

    expect(span.textContent).toBe('5');

    state.ui.count = 10;
    expect(span.textContent).toBe('10');
  });

  it('E5: data-ignition-class обновляется точечно', () => {
    const div = document.createElement('div');
    div.setAttribute('data-ignition-class', 'is-active: ui.active');
    document.body.appendChild(div);

    initBinding(state, div);

    expect(div.classList.contains('is-active')).toBe(false);

    state.ui.active = true;
    expect(div.classList.contains('is-active')).toBe(true);
  });

  it('E5: data-ignition-attr-* обновляется точечно', () => {
    const button = document.createElement('button');
    button.setAttribute('data-ignition-attr-disabled', '!ui.active');
    document.body.appendChild(button);

    initBinding(state, button);

    expect(button.disabled).toBe(true);

    state.ui.active = true;
    expect(button.disabled).toBe(false);
  });
});
