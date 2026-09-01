// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iife = readFileSync(
  path.resolve(__dirname, '../../engine/core/assets/ignition-runtime.js'),
  'utf8'
);

/**
 * Nested partial calls: a template source may contain {{> other/template}}.
 * The runtime registers each template as a Handlebars partial, so nested
 * calls resolve (chat streams: {{#each messages}}{{> row}}{{/each}}).
 */
describe('client runtime: nested partial resolution', () => {
  it('renders a template that calls another registered template', () => {
    window.Handlebars = Handlebars;
    window.__IGNITION_TEMPLATES__ = {
      'app/stream': '{{#each messages}}{{> app/row}}{{/each}}',
      'app/row': '<div class="row">{{name}}</div>'
    };
    window.__IGNITION_INITIAL_DATA__ = { messages: [{ name: 'A' }, { name: 'B' }] };

    // eslint-disable-next-line no-eval
    (0, eval)(iife);

    const html = window.ignition.renderTemplate('app/stream', window.__IGNITION_INITIAL_DATA__);
    expect(html).toContain('<div class="row">A</div>');
    expect(html).toContain('<div class="row">B</div>');
  });

  it('a missing nested partial still throws a readable error', () => {
    window.Handlebars = Handlebars;
    window.__IGNITION_TEMPLATES__ = {
      'app/lonely': '{{> app/ghost}}'
    };
    window.__IGNITION_INITIAL_DATA__ = {};

    (0, eval)(iife);

    expect(() => window.ignition.renderTemplate('app/lonely', {})).toThrow(/app\/ghost/);
  });
});
