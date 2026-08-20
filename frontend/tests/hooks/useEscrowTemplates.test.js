import { renderHook, waitFor } from '@testing-library/react';
import { createTemplate, getTemplate, listTemplates, useTemplate, deleteTemplate, updateTemplate, useTemplates } from '../../hooks/useEscrowTemplates';

var mockApi;

jest.mock('../../lib/api/client', () => {
  mockApi = { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() };
  return { __esModule: true, default: mockApi };
});

describe('useEscrowTemplates API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listTemplates returns templates and pagination', async () => {
    mockApi.get.mockResolvedValue({
      data: { data: [{ id: 't1', name: 'A' }], meta: { pagination: { total: 1 } } },
    });
    const result = await listTemplates({ scope: 'mine' });
    expect(mockApi.get).toHaveBeenCalledWith('/v1/templates', { params: { page: 1, limit: 20, scope: 'mine' } });
    expect(result.templates).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });

  it('getTemplate returns the template data', async () => {
    mockApi.get.mockResolvedValue({ data: { data: { id: 't1', name: 'A' } } });
    const tpl = await getTemplate('t1');
    expect(mockApi.get).toHaveBeenCalledWith('/v1/templates/t1');
    expect(tpl.id).toBe('t1');
  });

  it('createTemplate posts the payload and returns the created template', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { id: 't1', name: 'A' } } });
    const created = await createTemplate({
      name: 'A',
      description: 'd',
      isPublic: true,
      templateData: { version: 1 },
    });
    expect(mockApi.post).toHaveBeenCalledWith('/v1/templates', {
      name: 'A',
      description: 'd',
      isPublic: true,
      templateData: { version: 1 },
    });
    expect(created.id).toBe('t1');
  });

  it('updateTemplate puts the payload', async () => {
    mockApi.put.mockResolvedValue({ data: { data: { id: 't1' } } });
    await updateTemplate('t1', { name: 'B' });
    expect(mockApi.put).toHaveBeenCalledWith('/v1/templates/t1', { name: 'B' });
  });

  it('deleteTemplate deletes by id', async () => {
    mockApi.delete.mockResolvedValue({});
    await deleteTemplate('t1');
    expect(mockApi.delete).toHaveBeenCalledWith('/v1/templates/t1');
  });

  it('useTemplate posts to the use endpoint and returns templateData', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { id: 't1', usageCount: 4, templateData: { version: 1 } } } });
    const result = await useTemplate('t1');
    expect(mockApi.post).toHaveBeenCalledWith('/v1/templates/t1/use');
    expect(result.usageCount).toBe(4);
  });

  it('useTemplates hook loads templates on mount', async () => {
    mockApi.get.mockResolvedValue({
      data: { data: [{ id: 't1', name: 'A' }], meta: { pagination: { total: 1 } } },
    });
    const { result } = renderHook(() => useTemplates({ scope: 'mine' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.templates).toHaveLength(1);
  });
});
