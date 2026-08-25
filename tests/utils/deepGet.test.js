import { describe, it, expect } from 'vitest';
import deepGet from '../../engine/utils/deepGet.js';

describe('deepGet', () => {
  it('retrieves a top-level property', () => {
    expect(deepGet({ a: 1 }, 'a')).toBe(1);
  });

  it('retrieves a nested property', () => {
    expect(deepGet({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('returns defaultValue for missing path', () => {
    expect(deepGet({ a: 1 }, 'b')).toBeNull();
  });

  it('returns custom defaultValue for missing path', () => {
    expect(deepGet({ a: 1 }, 'b', 'fallback')).toBe('fallback');
  });

  it('returns defaultValue for null object', () => {
    expect(deepGet(null, 'a.b')).toBeNull();
  });

  it('returns defaultValue for undefined object', () => {
    expect(deepGet(undefined, 'a.b')).toBeNull();
  });

  it('returns defaultValue for empty path', () => {
    expect(deepGet({ a: 1 }, '')).toBeNull();
  });

  it('handles intermediate null values', () => {
    expect(deepGet({ a: null }, 'a.b')).toBeNull();
  });

  it('handles intermediate undefined values', () => {
    expect(deepGet({ a: undefined }, 'a.b')).toBeNull();
  });

  it('retrieves array elements', () => {
    expect(deepGet({ a: [10, 20, 30] }, 'a.1')).toBe(20);
  });

  it('returns default for non-object input', () => {
    expect(deepGet(42, 'a')).toBeNull();
    expect(deepGet('string', 'a')).toBeNull();
    expect(deepGet(true, 'a')).toBeNull();
  });
});
