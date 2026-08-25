import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createReactiveState } from '../../engine/core/runtime/state.js';
import { registerTemplate, renderTemplate, getTemplate } from '../../engine/core/runtime/render.js';

describe('ignition.render — клиентский рендеринг шаблонов', () => {

  describe('registry шаблонов', () => {
    it('регистрирует шаблон по имени', () => {
      const fn = vi.fn(() => '<p>hello</p>');
      registerTemplate('test/partial', fn);
      expect(getTemplate('test/partial')).toBe(fn);
    });

    it('рендерит зарегистрированный шаблон с данными', () => {
      const fn = vi.fn((data) => `<p>${data.name}</p>`);
      registerTemplate('user/greeting', fn);
      const result = renderTemplate('user/greeting', { name: 'Мир' });
      expect(result).toBe('<p>Мир</p>');
    });

    it('выбрасывает ошибку для незарегистрированного шаблона', () => {
      expect(() => renderTemplate('nonexistent/template', {}))
        .toThrow('Template not found: nonexistent/template');
    });

    it('перезаписывает шаблон при повторной регистрации', () => {
      registerTemplate('override/test', () => '<p>v1</p>');
      registerTemplate('override/test', () => '<p>v2</p>');
      const result = renderTemplate('override/test', {});
      expect(result).toBe('<p>v2</p>');
    });
  });

  describe('hydrate — атомарная замена DOM', () => {
    let container;

    beforeEach(() => {
      container = document.createElement('div');
      container.innerHTML = '<p>старый контент</p>';
      document.body.appendChild(container);
    });

    it('заменяет содержимое элемента', () => {
      const { hydrate } = require('../../engine/core/runtime/render.js');
      hydrate(container, '<p>новый контент</p>');
      expect(container.innerHTML).toBe('<p>новый контент</p>');
    });

    it('заменяет несколько дочерних элементов', () => {
      const { hydrate } = require('../../engine/core/runtime/render.js');
      hydrate(container, '<p>один</p><p>два</p>');
      expect(container.children).toHaveLength(2);
    });

    it('не ломает родительский контейнер', () => {
      const { hydrate } = require('../../engine/core/runtime/render.js');
      const parent = document.createElement('section');
      parent.appendChild(container);
      hydrate(container, '<span>ok</span>');
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(container);
    });
  });

  describe('fetchJson — загрузка данных', () => {
    it('загружает JSON по URL', async () => {
      const { fetchJson } = require('../../engine/core/runtime/render.js');
      const mockData = { items: [1, 2, 3] };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData)
      });
      const result = await fetchJson('/data/catalog/books.json');
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith('/data/catalog/books.json');
    });

    it('кэширует результат (повторный вызов без fetch)', async () => {
      const { fetchJson } = require('../../engine/core/runtime/render.js');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cached: true })
      });
      await fetchJson('/data/test.json');
      await fetchJson('/data/test.json');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('выбрасывает ошибку при HTTP 404', async () => {
      const { fetchJson } = require('../../engine/core/runtime/render.js');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      });
      await expect(fetchJson('/data/missing.json')).rejects.toThrow('404');
    });

    it('выбрасывает ошибку при сетевой ошибке', async () => {
      const { fetchJson } = require('../../engine/core/runtime/render.js');
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      await expect(fetchJson('/data/fail.json')).rejects.toThrow('Network error');
    });
  });
});
