import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paginateCollection, preparePageData } from '../../engine/core/pagination.js';

describe('paginateCollection', () => {
  const data = {
    items: Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }))
  };

  it('splits collection into pages of correct size', () => {
    const pages = paginateCollection(data, 'items', 10);
    expect(pages).toHaveLength(3);
    expect(pages[0].items).toHaveLength(10);
    expect(pages[1].items).toHaveLength(10);
    expect(pages[2].items).toHaveLength(5);
  });

  it('assigns correct page numbers', () => {
    const pages = paginateCollection(data, 'items', 10);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[1].pageNumber).toBe(2);
    expect(pages[2].pageNumber).toBe(3);
  });

  it('calculates totalPages correctly', () => {
    const pages = paginateCollection(data, 'items', 10);
    expect(pages[0].totalPages).toBe(3);
    expect(pages[1].totalPages).toBe(3);
    expect(pages[2].totalPages).toBe(3);
  });

  it('handles collection that fits on one page', () => {
    const smallData = { items: [{ id: 1 }, { id: 2 }] };
    const pages = paginateCollection(smallData, 'items', 10);
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toHaveLength(2);
    expect(pages[0].totalPages).toBe(1);
  });

  it('handles empty collection', () => {
    const pages = paginateCollection({ items: [] }, 'items', 10);
    expect(pages).toHaveLength(0);
  });

  it('returns empty array for non-array collection', () => {
    const pages = paginateCollection({ items: 'not an array' }, 'items', 10);
    expect(pages).toHaveLength(0);
  });

  it('returns empty array for missing collection path', () => {
    const pages = paginateCollection({ items: [1, 2] }, 'nonexistent', 10);
    expect(pages).toHaveLength(0);
  });

  it('clamps perPage to minimum of 1', () => {
    const pages = paginateCollection(data, 'items', 0);
    expect(pages).toHaveLength(25);
  });

  it('handles perPage larger than collection', () => {
    const pages = paginateCollection(data, 'items', 100);
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toHaveLength(25);
  });

  it('handles nested collection paths', () => {
    const nested = { catalog: { products: [1, 2, 3] } };
    const pages = paginateCollection(nested, 'catalog.products', 2);
    expect(pages).toHaveLength(2);
    expect(pages[0].items).toHaveLength(2);
    expect(pages[1].items).toHaveLength(1);
  });
});

describe('preparePageData', () => {
  it('adds pagination metadata to data', () => {
    const data = { title: 'Catalog', items: [1, 2, 3] };
    const page = { pageNumber: 2, items: [4, 5, 6], totalPages: 5 };
    const result = preparePageData(data, page, 2);

    expect(result.pagination.currentPage).toBe(2);
    expect(result.pagination.totalPages).toBe(5);
    expect(result.pagination.items).toEqual([4, 5, 6]);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
    expect(result.pagination.nextPage).toBe(3);
    expect(result.pagination.prevPage).toBe(1);
  });

  it('sets hasNext=false on last page', () => {
    const data = {};
    const page = { pageNumber: 5, items: [], totalPages: 5 };
    const result = preparePageData(data, page, 5);

    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(true);
  });

  it('sets hasPrev=false on first page', () => {
    const data = {};
    const page = { pageNumber: 1, items: [], totalPages: 5 };
    const result = preparePageData(data, page, 1);

    expect(result.pagination.hasPrev).toBe(false);
    expect(result.pagination.hasNext).toBe(true);
  });

  it('sets both hasNext and hasPrev=false for single page', () => {
    const data = {};
    const page = { pageNumber: 1, items: [], totalPages: 1 };
    const result = preparePageData(data, page, 1);

    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it('preserves original data fields', () => {
    const data = { title: 'Test', meta: { description: 'Hello' } };
    const page = { pageNumber: 1, items: [], totalPages: 1 };
    const result = preparePageData(data, page, 1);

    expect(result.title).toBe('Test');
    expect(result.meta).toEqual({ description: 'Hello' });
  });
});
