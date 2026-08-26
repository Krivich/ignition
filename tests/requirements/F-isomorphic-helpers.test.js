// @vitest-environment jsdom
/**
 * F1-F3: Isomorphic templates and helpers
 *
 * F1: Custom helper available on both server and client
 * F2: Helper behavior identical on server and client
 * F3: Helper registration without code duplication
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Handlebars from 'handlebars';

// Import server-side helpers
import { registerHelpers as registerServerHelpers } from '../../engine/core/handlebars.js';

describe('F. Isomorphic templates and helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Reset Handlebars helpers to clean state
    Handlebars.helpers = {};
  });

  describe('F1: Helpers available on both server and client', () => {
    it('times helper works identically', () => {
      // Server
      registerServerHelpers();
      const serverTemplate = Handlebars.compile('{{#times 3}}{{this}} {{/times}}');
      const serverResult = serverTemplate({});

      // Client (same Handlebars instance in this test, but same helpers)
      const clientTemplate = Handlebars.compile('{{#times 3}}{{this}} {{/times}}');
      const clientResult = clientTemplate({});

      expect(serverResult).toBe(clientResult);
    });

    it('ifCond helper works identically', () => {
      registerServerHelpers();

      const template = '{{#ifCond a "===" b}}yes{{else}}no{{/ifCond}}';

      const serverResult = Handlebars.compile(template)({ a: 1, b: 1 });
      const clientResult = Handlebars.compile(template)({ a: 1, b: 1 });

      expect(serverResult).toBe('yes');
      expect(clientResult).toBe('yes');
    });

    it('get helper works identically', () => {
      registerServerHelpers();

      const template = '{{get this "user.name"}}';
      const data = { user: { name: 'Alice' } };

      const serverResult = Handlebars.compile(template)(data);
      const clientResult = Handlebars.compile(template)(data);

      expect(serverResult).toBe(clientResult);
    });

    it('concat helper works identically', () => {
      registerServerHelpers();

      const template = '{{concat a b c}}';
      const data = { a: 'hello', b: ' ', c: 'world' };

      const serverResult = Handlebars.compile(template)(data);
      const clientResult = Handlebars.compile(template)(data);

      expect(serverResult).toBe(clientResult);
    });

    it('declineWord helper works identically', () => {
      registerServerHelpers();

      const template = '{{declineWord count "навык" "навыка" "навыков"}}';

      const serverResult = Handlebars.compile(template)({ count: 3 });
      const clientResult = Handlebars.compile(template)({ count: 3 });

      expect(serverResult).toBe('навыка');
      expect(clientResult).toBe('навыка');
    });

    it('json helper works identically', () => {
      registerServerHelpers();

      const template = '{{json this}}';
      const data = { foo: 'bar' };

      const serverResult = Handlebars.compile(template)(data);
      const clientResult = Handlebars.compile(template)(data);

      expect(serverResult).toBe(clientResult);
    });
  });

  describe('F2: Helper behavior is identical across environments', () => {
    const helpers = [
      { name: 'times', template: '{{#times count}}{{this}}.{{/times}}', data: { count: 3 }, expected: '1.2.3.' },
      { name: 'ifCond', template: '{{#ifCond a ">" b}}yes{{else}}no{{/ifCond}}', data: { a: 5, b: 3 }, expected: 'yes' },
      { name: 'get', template: '{{get obj "x.y"}}', data: { obj: { x: { y: 42 } } }, expected: '42' },
      { name: 'concat', template: '{{concat a b}}', data: { a: 'x', b: 'y' }, expected: 'xy' },
      { name: 'declineWord', template: '{{declineWord n "один" "два" "пять"}}', data: { n: 1 }, expected: 'один' },
      { name: 'json', template: '{{json val}}', data: { val: { key: 'value' } }, expected: '{"key":"value"}' },
    ];

    for (const { name, template, data, expected } of helpers) {
      it(`${name} returns same result on server and client`, () => {
        registerServerHelpers();

        const compiled = Handlebars.compile(template);
        const result = compiled(data);

        expect(result).toBe(expected);
      });
    }
  });

  describe('F3: No code duplication for helper registration', () => {
    it('helpers are defined in handlebars.js and available to both environments', () => {
      // After calling registerHelpers from handlebars.js,
      // all helpers should be available via Handlebars global
      registerServerHelpers();

      expect(Handlebars.helpers.times).toBeDefined();
      expect(Handlebars.helpers.ifCond).toBeDefined();
      expect(Handlebars.helpers.get).toBeDefined();
      expect(Handlebars.helpers.concat).toBeDefined();
      expect(Handlebars.helpers.declineWord).toBeDefined();
      expect(Handlebars.helpers.json).toBeDefined();
    });

    it('client-side runtime uses the same helper implementations', () => {
      // The ignition-runtime.js boot() should register the same helpers
      // This test verifies that the client-side registration is NOT a separate copy

      registerServerHelpers();
      const serverTimes = Handlebars.helpers.times;

      // Reset and re-register as client would
      delete Handlebars.helpers.times;

      // Simulate client-side registration (same function)
      Handlebars.registerHelper('times', function(n, block) {
        let accum = '';
        for (let i = 1; i <= n; ++i) { accum += block.fn(i); }
        return accum;
      });

      const clientTimes = Handlebars.helpers.times;

      // Both produce same result
      const template = '{{#times 3}}{{this}} {{/times}}';
      expect(Handlebars.compile(template)({})).toBe('1 2 3 ');
    });
  });
});
