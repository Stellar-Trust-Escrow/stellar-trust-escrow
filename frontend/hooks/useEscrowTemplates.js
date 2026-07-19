/**
 * Escrow Templates API hook.
 *
 * Thin client around the backend template endpoints mounted at
 * `/api/v1/templates`. The axios instance already attaches the bearer token
 * when the user is signed in, so authenticated calls just work.
 *
 *   listTemplates({ scope, search, page, limit }) → { templates, pagination }
 *   getTemplate(id)                                → template
 *   createTemplate(payload)                        → template
 *   updateTemplate(id, payload)                    → template
 *   deleteTemplate(id)                             → void
 *   useTemplate(id)                                → { id, usageCount, templateData }
 *   useTemplates({ scope, search })                → React state hook
 */

import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api/client';
import { buildTemplateDataFromForm } from '../lib/templates';

export async function listTemplates({ scope, search, page = 1, limit = 20 } = {}) {
  const params = { page, limit };
  if (scope) params.scope = scope;
  if (search) params.search = search;

  const res = await api.get('/v1/templates', { params });
  const templates = res.data?.data ?? [];
  const pagination = res.data?.meta?.pagination ?? { page, limit, total: templates.length };
  return { templates, pagination };
}

export async function getTemplate(id) {
  const res = await api.get(`/v1/templates/${encodeURIComponent(id)}`);
  return res.data?.data;
}

export async function createTemplate({ name, description, isPublic, templateData }) {
  const res = await api.post('/v1/templates', {
    name,
    description: description ?? null,
    isPublic: Boolean(isPublic),
    templateData,
  });
  return res.data?.data;
}

export async function updateTemplate(id, { name, description, isPublic, templateData }) {
  const res = await api.put(`/v1/templates/${encodeURIComponent(id)}`, {
    name,
    description,
    isPublic,
    templateData,
  });
  return res.data?.data;
}

export async function deleteTemplate(id) {
  await api.delete(`/v1/templates/${encodeURIComponent(id)}`);
}

export async function useTemplate(id) {
  const res = await api.post(`/v1/templates/${encodeURIComponent(id)}/use`);
  return res.data?.data;
}

/** React hook that loads a list of templates for a given scope (mine/public). */
export function useTemplates({ scope = 'mine', search = '', page = 1, limit = 20 } = {}) {
  const [templates, setTemplates] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (overrides = {}) => {
      const nextScope = overrides.scope ?? scope;
      const nextSearch = overrides.search ?? search;
      const nextPage = overrides.page ?? page;
      setLoading(true);
      setError(null);
      try {
        const result = await listTemplates({
          scope: nextScope,
          search: nextSearch,
          page: nextPage,
          limit,
        });
        setTemplates(result.templates);
        setPagination(result.pagination);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [scope, search, page, limit],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { templates, pagination, loading, error, reload: load };
}

export { buildTemplateDataFromForm };
export default {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  useTemplate,
  useTemplates,
};
