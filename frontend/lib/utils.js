/**
 * Merges class names, filtering out falsy values.
 * Lightweight replacement for clsx + tailwind-merge.
 * @param {...(string|boolean|null|undefined)} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}
