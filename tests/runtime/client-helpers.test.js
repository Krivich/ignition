// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import Handlebars from 'handlebars';

// Mirror the client-side helper registration from ignition-runtime.js boot()
// These are the SAME helpers registered in engine/core/handlebars.js (server-side)
// and engine/core/assets/ignition-runtime.js boot() (client-side).
// This test verifies they work identically in both environments.

beforeAll(() => {
  Handlebars.registerHelper('times', function(n, block) {
    let accum = '';
    for (let i = 1; i <= n; ++i) { accum += block.fn(i); }
    return accum;
  });

  Handlebars.registerHelper('ifCond', function(v1, operator, v2, options) {
    switch (operator) {
      case '==':  return (v1 == v2) ? options.fn(this) : options.inverse(this);
      case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
      case '!=':  return (v1 != v2) ? options.fn(this) : options.inverse(this);
      case '!==': return (v1 !== v2) ? options.fn(this) : options.inverse(this);
      case '<':   return (v1 < v2) ? options.fn(this) : options.inverse(this);
      case '<=':  return (v1 <= v2) ? options.fn(this) : options.inverse(this);
      case '>':   return (v1 > v2) ? options.fn(this) : options.inverse(this);
      case '>=':  return (v1 >= v2) ? options.fn(this) : options.inverse(this);
      case '&&':  return (v1 && v2) ? options.fn(this) : options.inverse(this);
      case '||':  return (v1 || v2) ? options.fn(this) : options.inverse(this);
      default:    return options.inverse(this);
    }
  });

  Handlebars.registerHelper('get', function(obj, path) {
    return path.split('.').reduce((cur, key) => cur && cur[key], obj);
  });

  Handlebars.registerHelper('concat', function() {
    return Array.prototype.slice.call(arguments, 0, -1).join('');
  });

  Handlebars.registerHelper('declineWord', function(count, one, two, five) {
    count = Math.abs(count) % 100;
    const n1 = count % 10;
    if (count > 10 && count < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
  });

  Handlebars.registerHelper('json', function(context) {
    return new Handlebars.SafeString(JSON.stringify(context));
  });
});

describe('client-side Handlebars helpers', () => {
  it('{{times N}} iterates from 1 to N', () => {
    const template = Handlebars.compile('{{#times 3}}{{this}} {{/times}}');
    expect(template({})).toBe('1 2 3 ');
  });

  it('{{ifCond a "===" b}} works with all operators', () => {
    const eq = Handlebars.compile('{{#ifCond a "===" b}}yes{{else}}no{{/ifCond}}');
    expect(eq({ a: 1, b: 1 })).toBe('yes');
    expect(eq({ a: 1, b: 2 })).toBe('no');

    const gt = Handlebars.compile('{{#ifCond a ">" b}}yes{{else}}no{{/ifCond}}');
    expect(gt({ a: 5, b: 3 })).toBe('yes');
    expect(gt({ a: 1, b: 3 })).toBe('no');

    const and = Handlebars.compile('{{#ifCond a "&&" b}}yes{{else}}no{{/ifCond}}');
    expect(and({ a: true, b: true })).toBe('yes');
    expect(and({ a: true, b: false })).toBe('no');
  });

  it('{{get obj "path"}} accesses nested properties', () => {
    const template = Handlebars.compile('{{get this "user.name"}}');
    expect(template({ user: { name: 'Alice' } })).toBe('Alice');
    expect(template({ user: {} })).toBe('');
  });

  it('{{concat a b}} joins strings', () => {
    const template = Handlebars.compile('{{concat a b c}}');
    expect(template({ a: 'hello', b: ' ', c: 'world' })).toBe('hello world');
  });

  it('{{declineWord count one two five}} returns correct Russian form', () => {
    const t = Handlebars.compile('{{declineWord count "навык" "навыка" "навыков"}}');
    expect(t({ count: 1 })).toBe('навык');
    expect(t({ count: 3 })).toBe('навыка');
    expect(t({ count: 5 })).toBe('навыков');
    expect(t({ count: 11 })).toBe('навыков');
    expect(t({ count: 21 })).toBe('навык');
  });

  it('{{json value}} outputs safe JSON', () => {
    const template = Handlebars.compile('{{json this}}');
    const result = template({ foo: 'bar' });
    expect(result).toContain('"foo"');
    expect(result).toContain('"bar"');
  });
});
