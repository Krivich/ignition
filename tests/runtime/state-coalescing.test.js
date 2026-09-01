import { describe, it, expect, vi } from 'vitest';
import { createReactiveState } from '../../engine/core/runtime/state.js';

describe('ignition.state — коалесцинг мутаций', () => {
  it('пачка set на один путь в одном task → один проход уведомлений', () => {
    const state = createReactiveState({ products: [{ price: 1 }, { price: 2 }] });
    const spy = vi.fn();
    state.subscribe('products.1.price', spy);

    state.products[1].price = 10;
    state.products[1].price = 20;
    state.products[1].price = 30;

    expect(spy).not.toHaveBeenCalled();
    state.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][2]).toBe(30);
  });

  it('flush без мутаций — no-op без ошибок', () => {
    const state = createReactiveState({ a: 1 });
    expect(() => state.flush()).not.toThrow();
  });

  it('state.set участвует в коалесцинге', () => {
    const state = createReactiveState({ count: 0 });
    const spy = vi.fn();
    state.subscribe('count', spy);

    state.set('count', 1);
    state.set('count', 2);

    state.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][2]).toBe(2);
  });

  it('авто-флаш в микротаске после выхода из стека', async () => {
    const state = createReactiveState({ n: 0 });
    const spy = vi.fn();
    state.subscribe('n', spy);

    state.n = 1;
    expect(spy).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('мутация во время флаша обрабатывается в том же цикле (реентрантность)', () => {
    const state = createReactiveState({ a: 0, b: 0 });
    const spyB = vi.fn();
    state.subscribe('b', spyB);
    state.subscribe('a', () => {
      state.b = 99;
    });

    state.a = 1;
    state.flush();
    expect(spyB).toHaveBeenCalledTimes(1);
    expect(spyB.mock.calls[0][2]).toBe(99);
  });
});