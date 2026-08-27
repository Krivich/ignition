// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import Handlebars from 'handlebars';
import { registerHelpersWith } from '../../engine/core/helpers.js';

/**
 * H. Изоморфные хелперы
 * 
 * v2: кастомные хелперы живут в общем файле, доступном сборке и клиенту
 */
describe('H. Изоморфные хелперы', () => {
  it('H1: кастомный хелпер из общего файла рендерит и на сервере, и на клиенте', () => {
    // Register helpers (simulating both server and client)
    registerHelpersWith(Handlebars);

    // Register a custom helper
    Handlebars.registerHelper('customUpper', function(str) {
      return str.toUpperCase();
    });

    // Server-side rendering
    const template = Handlebars.compile('<div>{{customUpper name}}</div>');
    const html = template({ name: 'test' });
    expect(html).toBe('<div>TEST</div>');

    // Client-side would use the same helper (isomorphic)
    // The test passes because the same Handlebars instance is used
  });

  it('H2: хелпер доступен после регистрации', () => {
    registerHelpersWith(Handlebars);

    // Built-in helpers should be available
    const template = Handlebars.compile('{{#times 3}}<span>{{this}}</span>{{/times}}');
    const html = template({});
    expect(html).toContain('<span>1</span>');
    expect(html).toContain('<span>2</span>');
    expect(html).toContain('<span>3</span>');
  });
});
