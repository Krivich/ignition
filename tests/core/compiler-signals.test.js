import { describe, it, expect } from 'vitest';
import { collectRootSignals } from '../../engine/core/compiler.js';

describe('collectRootSignals', () => {
  it('collects root-context {{#if}} branch paths', () => {
    const src = '{{#if metrics.loading}}<div class="skeleton"></div>{{/if}}';
    expect(collectRootSignals(src)).toEqual(['metrics.loading']);
  });

  it('collects {{#unless}} too', () => {
    const src = '{{#unless ui.hidden}}shown{{/unless}}';
    expect(collectRootSignals(src)).toEqual(['ui.hidden']);
  });

  it('dedupes repeated paths and keeps order', () => {
    const src =
      '{{#if a.b}}x{{/if}}{{#unless a.b}}y{{/unless}}{{#if a.b}}z{{/if}}';
    expect(collectRootSignals(src)).toEqual(['a.b']);
  });

  it('ignores paths inside context-shifting #each/#with', () => {
    const src = '{{#each products}}<p>{{#if price.discounted}}!{{/if}}</p>{{/each}}';
    expect(collectRootSignals(src)).toEqual([]);
  });

  it('ignores this/../@/helper-condition paths', () => {
    expect(collectRootSignals('{{#if this}}x{{/if}}')).toEqual([]);
    expect(collectRootSignals('{{#if ../x}}x{{/if}}')).toEqual([]);
    expect(collectRootSignals('{{#if @index}}x{{/if}}')).toEqual([]);
    expect(collectRootSignals('{{#if (gt a b)}}x{{/if}}')).toEqual([]);
    expect(collectRootSignals('{{#if foo}}x{{/if}}{{#unless foo}}y{{/unless}}')).toEqual(['foo']);
  });

  it('collects root signals even when nested #if inside root #if', () => {
    const src = '{{#if loading}}<div>{{#if error}}err{{/if}}</div>{{/if}}';
    expect(collectRootSignals(src)).toEqual(['loading', 'error']);
  });
});
