/**
 * TagInput Component
 *
 * Renders entered values as removable chips inside an input field.
 * Pressing Enter or comma adds a chip from the current input value.
 * Backspace when input is empty removes the last chip.
 * Clicking the × on a chip removes it.
 *
 * @param {object}   props
 * @param {string[]} [props.tags]           - Controlled tags array (parent must update via onChange)
 * @param {number}   [props.maxTags]        - Maximum number of tags allowed
 * @param {function} props.onChange         - Called with (tags: string[]) on every change
 * @param {string}   [props.placeholder]
 * @param {string}   [props.className]
 * @param {boolean}  [props.disabled=false]
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';

export default function TagInput({
  tags: externalTags,
  maxTags,
  onChange,
  placeholder = 'Type and press Enter…',
  className = '',
  disabled = false,
}) {
  const [inputValue, setInputValue] = useState('');
  const [internalTags, setInternalTags] = useState(externalTags || []);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Sync external tags
  useEffect(() => {
    if (externalTags !== undefined) {
      setInternalTags(externalTags);
    }
  }, [externalTags]);

  const tags = externalTags !== undefined ? externalTags : internalTags;
  const isAtLimit = maxTags !== undefined && tags.length >= maxTags;
  const isDisabled = disabled || isAtLimit;

  const emitChange = useCallback(
    (newTags) => {
      if (externalTags === undefined) {
        setInternalTags(newTags);
      }
      onChange?.(newTags);
    },
    [onChange, externalTags],
  );

  const addTag = useCallback(
    (value) => {
      const trimmed = value.trim();
      if (!trimmed || isAtLimit) return;
      // Avoid duplicates (case-insensitive)
      if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
      emitChange([...tags, trimmed]);
    },
    [tags, isAtLimit, emitChange],
  );

  const removeTag = useCallback(
    (index) => {
      const next = tags.filter((_, i) => i !== index);
      emitChange(next);
    },
    [tags, emitChange],
  );

  const removeLastTag = useCallback(() => {
    if (tags.length === 0) return;
    emitChange(tags.slice(0, -1));
  }, [tags, emitChange]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(inputValue);
        setInputValue('');
      } else if (e.key === 'Backspace' && inputValue === '') {
        removeLastTag();
      }
    },
    [inputValue, addTag, removeLastTag],
  );

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`flex flex-wrap items-center gap-1.5 min-h-[42px] px-3 py-2
        bg-gray-900 border border-gray-700 rounded-lg
        focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500
        transition-colors cursor-text
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}`}
      role="list"
      aria-label="Tag input"
    >
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          role="listitem"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm
                     bg-indigo-600/20 border border-indigo-500/30 text-indigo-300
                     animate-fade-in"
        >
          <span className="max-w-[160px] truncate">{tag}</span>
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(index);
              }}
              className="ml-0.5 p-0.5 rounded-full hover:bg-indigo-500/30
                         text-indigo-400 hover:text-indigo-200 transition-colors"
              aria-label={`Remove ${tag}`}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}

      {!isDisabled && (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none
                     text-sm text-white placeholder-gray-500 py-0.5"
          aria-label="Add tag"
        />
      )}

      {isAtLimit && (
        <span className="text-xs text-amber-400 ml-1 animate-fade-in">
          Max {maxTags} tags
        </span>
      )}
    </div>
  );
}
