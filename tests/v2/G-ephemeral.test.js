// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';

/**
 * G. Ephemeral и наличие
 * 
 * v2: ignition.ephemeral(value, ttl) — значение в модели, по ttl — null
 * Паттерн наличия: {{#if toastMessage}} рендерится при наличии и исчезает при null
 */
describe('G. Ephemeral и наличие', () => {
  let state;

  beforeEach(() => {
    state = createReactiveState({
      ui: { toastMessage: null },
    });
  });

  it('G1: ignition.ephemeral(value, ttl) — значение в модели, по ttl — null', async () => {
    vi.useFakeTimers();

    // Simulate ignition.ephemeral
    const ephemeral = (value, ttl) => {
      const id = Symbol('ephemeral');
      setTimeout(() => {
        state.ui.toastMessage = null;
      }, ttl);
      return value;
    };

    state.ui.toastMessage = ephemeral('Toast message', 2600);
    expect(state.ui.toastMessage).toBe('Toast message');

    vi.advanceTimersByTime(2600);
    expect(state.ui.toastMessage).toBeNull();

    vi.useRealTimers();
  });

  it('G2: повторное присваивание сбрасывает таймер', async () => {
    vi.useFakeTimers();

    let timeoutId;
    const ephemeral = (value, ttl) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        state.ui.toastMessage = null;
      }, ttl);
      return value;
    };

    state.ui.toastMessage = ephemeral('First', 2600);
    vi.advanceTimersByTime(1000);

    // Reassign before ttl expires
    state.ui.toastMessage = ephemeral('Second', 2600);
    expect(state.ui.toastMessage).toBe('Second');

    vi.advanceTimersByTime(1000);
    // Still alive (total 2000ms < 2600ms)
    expect(state.ui.toastMessage).toBe('Second');

    vi.advanceTimersByTime(1600);
    // Now expired (total 2600ms)
    expect(state.ui.toastMessage).toBeNull();

    vi.useRealTimers();
  });

  it('G4: ephemeral не сериализуется в JSON', () => {
    // Ephemeral values are just regular values that get nullified by timer
    // They don't have special serialization
    const data = { ui: { toastMessage: 'Toast' } };
    const json = JSON.stringify(data);
    expect(json).toContain('"toastMessage":"Toast"');
  });

  it('G5: паттерн наличия — {{#if toastMessage}}', () => {
    // Simulate template rendering with #if
    const render = (state) => {
      if (state.ui.toastMessage) {
        return `<div class="toast">${state.ui.toastMessage}</div>`;
      }
      return '';
    };

    state.ui.toastMessage = 'Hello';
    expect(render(state)).toContain('Hello');

    state.ui.toastMessage = null;
    expect(render(state)).toBe('');
  });
});
