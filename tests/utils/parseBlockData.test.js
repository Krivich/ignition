import { describe, it, expect } from 'vitest';
import { parseBlockData, buildBlockContext } from '../../engine/utils/parseBlockData.js';

describe('parseBlockData', () => {
  it('returns single mode for one path', () => {
    expect(parseBlockData('products')).toEqual({
      mode: 'single',
      paths: [{ path: 'products', alias: 'products' }]
    });
  });

  it('returns multi mode for several paths', () => {
    expect(parseBlockData('form.skills, reference.suggestions')).toEqual({
      mode: 'multi',
      paths: [
        { path: 'form.skills', alias: 'skills' },
        { path: 'reference.suggestions', alias: 'suggestions' }
      ]
    });
  });

  it('supports explicit aliases', () => {
    expect(parseBlockData('form.skills as formSkills, reference.suggestions as refs')).toEqual({
      mode: 'multi',
      paths: [
        { path: 'form.skills', alias: 'formSkills' },
        { path: 'reference.suggestions', alias: 'refs' }
      ]
    });
  });

  it('trims whitespace around paths', () => {
    expect(parseBlockData('  form.skills  ,   reference.suggestions  ')).toEqual({
      mode: 'multi',
      paths: [
        { path: 'form.skills', alias: 'skills' },
        { path: 'reference.suggestions', alias: 'suggestions' }
      ]
    });
  });

  it('handles empty string', () => {
    expect(parseBlockData('')).toEqual({ mode: 'single', paths: [] });
  });
});

describe('buildBlockContext', () => {
  const data = {
    products: [{ id: 1 }],
    form: { skills: ['js'] },
    reference: { suggestions: ['ts'] }
  };

  it('returns the slice directly in single mode', () => {
    const parsed = parseBlockData('form.skills');
    const getter = (obj, path) => path.split('.').reduce((cur, key) => cur?.[key], obj);
    expect(buildBlockContext(data, parsed, getter)).toEqual(['js']);
  });

  it('returns an object with aliases in multi mode', () => {
    const parsed = parseBlockData('form.skills, reference.suggestions');
    const getter = (obj, path) => path.split('.').reduce((cur, key) => cur?.[key], obj);
    expect(buildBlockContext(data, parsed, getter)).toEqual({
      skills: ['js'],
      suggestions: ['ts']
    });
  });
});
