// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { registerTemplate, renderTemplate, getTemplate, hydrate, fetchJson, resetRegistry } from '../../engine/core/runtime/render.js';

describe('ignition.render — клиентский рендеринг шаблонов', () => {

  afterEach(() => {
    resetRegistry();
  });

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
      hydrate(container, '<p>новый контент</p>');
      expect(container.innerHTML).toBe('<p>новый контент</p>');
    });

    it('заменяет несколько дочерних элементов', () => {
      hydrate(container, '<p>один</p><p>два</p>');
      expect(container.children).toHaveLength(2);
    });

    it('не ломает родительский контейнер', () => {
      const parent = document.createElement('section');
      parent.appendChild(container);
      hydrate(container, '<span>ok</span>');
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(container);
    });
  });

  describe('hydrate — keyed reconciliation (data-ignition-key)', () => {
    let ul;
    const mk = (rows) => rows.map(r => `<li data-ignition-key="${r.id}">${r.name}</li>`).join('');

    beforeEach(() => {
      ul = document.createElement('ul');
      document.body.appendChild(ul);
    });

    it('сохраняет identity строки при переупорядочивании', () => {
      hydrate(ul, mk([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]));
      const a = ul.children[0], b = ul.children[1], c = ul.children[2];
      hydrate(ul, mk([{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }, { id: 'c', name: 'C' }]));
      expect(ul.children[0]).toBe(b);
      expect(ul.children[1]).toBe(a);
      expect(ul.children[2]).toBe(c);
      expect([...ul.children].map(x => x.getAttribute('data-ignition-key'))).toEqual(['b', 'a', 'c']);
    });

    it('вставляем строку в середине — существующие reuse, новые добавляются', () => {
      hydrate(ul, mk([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]));
      const a = ul.children[0], b = ul.children[1];
      hydrate(ul, mk([{ id: 'a', name: 'A' }, { id: 'x', name: 'X' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]));
      expect(ul.children[0]).toBe(a);
      expect(ul.children[2]).toBe(b);
      expect([...ul.children].map(x => x.getAttribute('data-ignition-key'))).toEqual(['a', 'x', 'b', 'c']);
    });

    it('удаляет строку и обновляет текст оставшихся', () => {
      hydrate(ul, mk([{ id: 'a', name: 'A' }, { id: 'x', name: 'X' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]));
      const x = ul.children[1];
      hydrate(ul, mk([{ id: 'a', name: 'A' }, { id: 'x', name: 'X EDITED' }, { id: 'b', name: 'B' }]));
      expect([...ul.children].map(n => n.getAttribute('data-ignition-key'))).toEqual(['a', 'x', 'b']);
      expect(ul.children[1]).toBe(x);
      expect(ul.children[1].textContent).toBe('X EDITED');
    });

    it('без data-ignition-key работает как обычный order-preserving reconcile', () => {
      hydrate(ul, '<li>1</li><li>2</li><li>3</li>');
      hydrate(ul, '<li>1</li><li>2 EDITED</li><li>3</li><li>4</li>');
      expect(ul.children).toHaveLength(4);
      expect(ul.children[1].textContent).toBe('2 EDITED');
    });

    it('data-ignition-key="" (поле отсутствует) ведёт себя как unkeyed: без коллизии пустых ключей', () => {
      hydrate(ul, '<li data-ignition-key="">a</li><li data-ignition-key="">b</li>');
      const a = ul.children[0];
      hydrate(ul, '<li data-ignition-key="">a EDITED</li><li data-ignition-key="">b</li><li data-ignition-key="">x</li>');
      expect(ul.children).toHaveLength(3);
      expect(ul.children[0]).toBe(a);
      expect(ul.children[0].textContent).toBe('a EDITED');
    });

    it('в смешанном списке пустые ключи матчатся по позиции, не вытесняя keyed-строки', () => {
      hydrate(ul, mk([{ id: 'a', name: 'A' }, { id: '', name: 'anon' }, { id: 'c', name: 'C' }]));
      const anon = ul.children[1];
      const c = ul.children[2];
      hydrate(ul, mk([{ id: 'a', name: 'A' }, { id: '', name: 'anon EDITED' }, { id: 'c', name: 'C' }]));
      expect(ul.children[1]).toBe(anon);
      expect(ul.children[1].textContent).toBe('anon EDITED');
      expect(ul.children[2]).toBe(c);
    });

    it('keyed структурная вставка сверху сохраняет фокус и текст редактируемого input', () => {
      // Rows as elements with an editable input; whitespace text nodes between
      // them, exactly like real SSR output.
      const row = (id, text) =>
        `<li data-ignition-key="${id}"><span>${text}</span><input class="t"></li>`;
      hydrate(ul, [row('b', 'B'), row('c', 'C')].join('\n  '));
      const inputs = ul.querySelectorAll('input.t');
      const inp = inputs[0];
      inp.value = 'edited';
      inp.focus();
      expect(document.activeElement).toBe(inp);

      // Insert a row ABOVE the focused one: keyed reconcile must keep the
      // focused input's identity and restore its focus + selection.
      hydrate(ul, [row('a', 'A'), row('b', 'B'), row('c', 'C')].join('\n  '));
      const inputsAfter = ul.querySelectorAll('input.t');
      expect(inputsAfter).toHaveLength(3);
      expect(inputsAfter[1]).toBe(inp);
      expect(inp.value).toBe('edited');
      expect(document.activeElement).toBe(inp);
    });
  });

  describe('fetchJson — загрузка данных', () => {
    it('загружает JSON по URL', async () => {
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
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cached: true })
      });
      await fetchJson('/data/test-cache.json');
      await fetchJson('/data/test-cache.json');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('выбрасывает ошибку при HTTP 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      });
      await expect(fetchJson('/data/missing.json')).rejects.toThrow('404');
    });

    it('выбрасывает ошибку при сетевой ошибке', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      await expect(fetchJson('/data/fail.json')).rejects.toThrow('Network error');
    });
  });
});
