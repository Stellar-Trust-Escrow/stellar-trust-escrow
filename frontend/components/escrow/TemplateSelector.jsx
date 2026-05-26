'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '../ui/Button';

const CUSTOM_TEMPLATES_KEY = 'escrow_custom_templates_v1';
const FAVORITES_KEY = 'escrow_template_favorites_v1';

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTemplate(template) {
  return {
    ...template,
    category: template.category || 'Uncategorized',
    milestones: Array.isArray(template.milestones)
      ? template.milestones.map((milestone) => ({
          title: milestone.title || '',
          description: milestone.description || '',
          amount: milestone.amount || '',
        }))
      : [],
  };
}

export default function TemplateSelector({
  baseTemplates = [],
  formData,
  onApplyTemplate,
  compact = false,
  quickStartPath = '/escrow/create',
}) {
  const [customTemplates, setCustomTemplates] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState('Custom');
  const [saveStatus, setSaveStatus] = useState('');

  const templates = useMemo(() => {
    return [...baseTemplates.map(normalizeTemplate), ...customTemplates.map(normalizeTemplate)];
  }, [baseTemplates, customTemplates]);

  const categories = useMemo(() => {
    const found = new Set(templates.map((template) => template.category || 'Uncategorized'));
    return ['All', ...Array.from(found)];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'All') {
      return templates;
    }

    return templates.filter((template) => template.category === selectedCategory);
  }, [templates, selectedCategory]);

  const selectedTemplate = useMemo(() => {
    return filteredTemplates.find((template) => template.id === selectedTemplateId) || null;
  }, [filteredTemplates, selectedTemplateId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const savedCustom = safeJsonParse(localStorage.getItem(CUSTOM_TEMPLATES_KEY), []);
    const savedFavorites = safeJsonParse(localStorage.getItem(FAVORITES_KEY), []);

    setCustomTemplates(Array.isArray(savedCustom) ? savedCustom : []);
    setFavoriteIds(Array.isArray(savedFavorites) ? savedFavorites : []);
  }, []);

  useEffect(() => {
    if (filteredTemplates.length === 0) {
      setSelectedTemplateId(null);
      return;
    }

    const exists = filteredTemplates.some((template) => template.id === selectedTemplateId);
    if (!exists) {
      setSelectedTemplateId(filteredTemplates[0].id);
    }
  }, [filteredTemplates, selectedTemplateId]);

  const persistCustomTemplates = (nextTemplates) => {
    setCustomTemplates(nextTemplates);

    if (typeof window !== 'undefined') {
      localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(nextTemplates));
    }
  };

  const persistFavorites = (nextFavorites) => {
    setFavoriteIds(nextFavorites);

    if (typeof window !== 'undefined') {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(nextFavorites));
    }
  };

  const toggleFavorite = (templateId) => {
    const hasFavorite = favoriteIds.includes(templateId);
    const nextFavorites = hasFavorite
      ? favoriteIds.filter((id) => id !== templateId)
      : [...favoriteIds, templateId];

    persistFavorites(nextFavorites);
  };

  const handleSaveCustomTemplate = () => {
    const name = customName.trim();
    if (!name) {
      setSaveStatus('Please add a template name before saving.');
      return;
    }

    const hasMeaningfulMilestones = Array.isArray(formData?.milestones)
      ? formData.milestones.some((milestone) =>
          Boolean(milestone.title || milestone.description || milestone.amount),
        )
      : false;
    const hasMeaningfulData = Boolean(
      formData?.totalAmount || formData?.briefDescription?.trim() || hasMeaningfulMilestones,
    );

    if (!hasMeaningfulData) {
      setSaveStatus('Add escrow details first, then save your custom template.');
      return;
    }

    const nextTemplate = {
      id: `custom-${Date.now()}`,
      name,
      description:
        formData?.briefDescription?.trim() ||
        'Custom template captured from the current escrow draft.',
      category: customCategory,
      tokenAddress: formData?.tokenAddress || 'usdc',
      totalAmount: formData?.totalAmount || '',
      briefDescription: formData?.briefDescription || '',
      deadline: formData?.deadline || '',
      milestones: Array.isArray(formData?.milestones)
        ? formData.milestones.map((milestone) => ({
            title: milestone.title || '',
            description: milestone.description || '',
            amount: milestone.amount || '',
          }))
        : [{ title: '', description: '', amount: '' }],
      isCustom: true,
    };

    const nextTemplates = [nextTemplate, ...customTemplates];
    persistCustomTemplates(nextTemplates);
    setSelectedCategory(nextTemplate.category);
    setSelectedTemplateId(nextTemplate.id);
    setCustomName('');
    setSaveStatus(`Saved "${nextTemplate.name}" to your custom templates.`);
  };

  const getTemplateQuickStartHref = (template) => {
    const id = encodeURIComponent(template.id);
    return `${quickStartPath}?template=${id}`;
  };

  return (
    <section className="card space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Escrow Templates</h2>
          <p className="text-sm text-gray-400">
            Start with proven structures, then adjust to match your agreement.
          </p>
        </div>
        {compact && (
          <Link href="/escrow/templates" className="text-sm text-indigo-400 hover:text-indigo-300">
            Open full gallery
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((category) => {
          const isActive = category === selectedCategory;

          return (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                isActive
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
          {filteredTemplates.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-700 p-4 text-sm text-gray-500">
              No templates in this category yet.
            </div>
          )}

          {filteredTemplates.map((template) => {
            const isSelected = selectedTemplateId === template.id;
            const isFavorite = favoriteIds.includes(template.id);

            return (
              <div
                key={template.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTemplateId(template.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedTemplateId(template.id);
                  }
                }}
                className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">{template.name}</p>
                    <p className="text-xs text-gray-400">{template.description}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={isFavorite ? 'Remove from favorites' : 'Save as favorite'}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(template.id);
                    }}
                    className={`text-lg leading-none transition-colors ${
                      isFavorite ? 'text-amber-400' : 'text-gray-600 hover:text-amber-300'
                    }`}
                  >
                    ★
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                    {template.category}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                    {template.milestones.length} milestones
                  </span>
                  <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                    {template.totalAmount || '—'} {String(template.tokenAddress || 'USDC').toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
          {!selectedTemplate && <p className="text-sm text-gray-500">Select a template to preview it.</p>}

          {selectedTemplate && (
            <>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">{selectedTemplate.name}</h3>
                <p className="text-sm text-gray-400">{selectedTemplate.description}</p>
              </div>

              <div className="text-sm text-gray-300 space-y-2">
                <p>
                  Category: <span className="text-white">{selectedTemplate.category}</span>
                </p>
                <p>
                  Amount: <span className="text-white">{selectedTemplate.totalAmount || '—'}</span>{' '}
                  {String(selectedTemplate.tokenAddress || 'USDC').toUpperCase()}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-300">Milestone preview</p>
                <ul className="space-y-2">
                  {selectedTemplate.milestones.map((milestone, index) => (
                    <li key={`${selectedTemplate.id}-${index}`} className="text-xs text-gray-400 border-l-2 border-gray-700 pl-3">
                      <p className="text-gray-200">{milestone.title || `Milestone ${index + 1}`}</p>
                      <p>{milestone.description || 'No description provided.'}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => onApplyTemplate?.(selectedTemplate)}>
                  Use This Template
                </Button>
                <Button type="button" variant="secondary" href={getTemplateQuickStartHref(selectedTemplate)}>
                  Quick Start
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4 space-y-3">
        <p className="text-sm font-medium text-white">Save Current Form as a Custom Template</p>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px_auto] gap-2">
          <input
            type="text"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder="Template name"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                       text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <select
            value={customCategory}
            onChange={(event) => setCustomCategory(event.target.value)}
            aria-label="Template category"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {Array.from(new Set(['Custom', ...categories.filter((category) => category !== 'All')])).map(
              (category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ),
            )}
          </select>
          <Button type="button" variant="secondary" onClick={handleSaveCustomTemplate}>
            Save Template
          </Button>
        </div>
        {saveStatus && <p className="text-xs text-gray-400">{saveStatus}</p>}
      </div>
    </section>
  );
}
