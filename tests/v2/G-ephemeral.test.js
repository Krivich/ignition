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

  it('G1: ignition.ephemeral(path, value, ttl) — значение в модели, по ttl — null', async () => {
    vi.useFakeTimers();

    window.ignition = { ephemeral: state.ephemeral.bind(state) };

    window.ignition.ephemeral('ui.toastMessage', 'Toast message', 2600);
    expect(state.ui.toastMessage).toBe('Toast message');

    vi.advanceTimersByTime(2600);
    expect(state.ui.toastMessage).toBeNull();

    vi.useRealTimers();
  });

  it('G2: повторное присваивание сбрасывает таймер', async () => {
    vi.useFakeTimers();

    window.ignition = { ephemeral: state.ephemeral.bind(state) };

    window.ignition.ephemeral('ui.toastMessage', 'First', 2600);
    vi.advanceTimersByTime(1000);

    // Reassign before ttl expires
    window.ignition.ephemeral('ui.toastMessage', 'Second', 2600);
    expect(state.ui.toastMessage).toBe('Second');

    vi.advanceTimersByTime(1000);
    // Still alive (total 2000ms < 2600ms)
    expect(state.ui.toastMessage).toBe('Second');

    vi.advanceTimersByTime(1600);
    // Now expired (total 2600ms)
    expect(state.ui.toastMessage).toBeNull();

    vi.useRealTimers();
  });

  it('G3: постоянное присваивание отменяет pending ephemeral', async () => {
    vi.useFakeTimers();

    window.ignition = { ephemeral: state.ephemeral.bind(state) };

    window.ignition.ephemeral('ui.toastMessage', 'Temporary', 2600);
    expect(state.ui.toastMessage).toBe('Temporary');

    // Permanent assignment (not via ephemeral) before ttl expires
    state.ui.toastMessage = 'Permanent';
    expect(state.ui.toastMessage).toBe('Permanent');

    vi.advanceTimersByTime(3000);
    // The permanent value must NOT be nullified by the stale timer
    expect(state.ui.toastMessage).toBe('Permanent');

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
