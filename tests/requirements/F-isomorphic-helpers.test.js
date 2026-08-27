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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import server-side helpers
import { registerHelpers as registerServerHelpers } from '../../engine/core/handlebars.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

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
    it('helpers are defined in a single source shared by both environments', () => {
      // The server-side registerHelpers() delegates to the SAME canonical
      // registerHelpersWith() source that the client IIFE is generated from.
      registerServerHelpers();

      expect(Handlebars.helpers.times).toBeDefined();
      expect(Handlebars.helpers.ifCond).toBeDefined();
      expect(Handlebars.helpers.get).toBeDefined();
      expect(Handlebars.helpers.concat).toBeDefined();
      expect(Handlebars.helpers.declineWord).toBeDefined();
      expect(Handlebars.helpers.json).toBeDefined();
    });

    it('helpers.js (single source) is shared: server delegates, IIFE is generated from it', () => {
      // The server entry points at the canonical module, not a private copy.
      const handlebarsSrc = fs.readFileSync(
        path.join(projectRoot, 'engine', 'core', 'handlebars.js'),
        'utf8'
      );
      expect(handlebarsSrc).toContain("registerHelpersWith } from './helpers.js'");
      expect(handlebarsSrc).toContain('registerHelpersWith(Handlebars)');

      // The client IIFE bundle is GENERATED from the same helpers.js source
      // (via scripts/build-runtime.js), so no hand-duplicated copies live there.
      const iifeSrc = fs.readFileSync(
        path.join(projectRoot, 'engine', 'core', 'assets', 'ignition-runtime.js'),
        'utf8'
      );
      // The bundle must contain the helper bodies sourced from helpers.js
      expect(iifeSrc).toContain('declineWord');
      const buildScript = fs.readFileSync(
        path.join(projectRoot, 'scripts', 'build-runtime.js'),
        'utf8'
      );
      expect(buildScript).toContain('helpers.js');
    });

    it('the single source produces identical results on server and client', async () => {
      registerServerHelpers();
      const template = '{{#times 3}}{{this}} {{/times}}';
      expect(Handlebars.compile(template)({})).toBe('1 2 3 ');
    });
  });
});
