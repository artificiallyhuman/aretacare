// Session background colors - 15 distinct subtle colors that work in both light and dark mode.
// IMPORTANT: All Tailwind classes are written as full strings so the JIT compiler picks them up.
// Dark mode uses -500 shades at low opacity to create a visible tint over the dark background.

export const SESSION_COLORS = [
  { key: 'slate', label: 'Slate', bgClass: 'bg-slate-50 dark:bg-slate-500/15', swatchLight: 'bg-slate-200', swatchDark: 'dark:bg-slate-600' },
  { key: 'sky', label: 'Sky', bgClass: 'bg-sky-50 dark:bg-sky-500/15', swatchLight: 'bg-sky-200', swatchDark: 'dark:bg-sky-700' },
  { key: 'teal', label: 'Teal', bgClass: 'bg-teal-50 dark:bg-teal-500/15', swatchLight: 'bg-teal-200', swatchDark: 'dark:bg-teal-700' },
  { key: 'green', label: 'Green', bgClass: 'bg-green-50 dark:bg-green-500/15', swatchLight: 'bg-green-200', swatchDark: 'dark:bg-green-700' },
  { key: 'lime', label: 'Lime', bgClass: 'bg-lime-50 dark:bg-lime-500/15', swatchLight: 'bg-lime-200', swatchDark: 'dark:bg-lime-700' },
  { key: 'blue', label: 'Blue', bgClass: 'bg-blue-50 dark:bg-blue-500/15', swatchLight: 'bg-blue-200', swatchDark: 'dark:bg-blue-700' },
  { key: 'indigo', label: 'Indigo', bgClass: 'bg-indigo-50 dark:bg-indigo-500/15', swatchLight: 'bg-indigo-200', swatchDark: 'dark:bg-indigo-700' },
  { key: 'purple', label: 'Purple', bgClass: 'bg-purple-50 dark:bg-purple-500/15', swatchLight: 'bg-purple-200', swatchDark: 'dark:bg-purple-700' },
  { key: 'zinc', label: 'Zinc', bgClass: 'bg-zinc-100 dark:bg-zinc-500/15', swatchLight: 'bg-zinc-300', swatchDark: 'dark:bg-zinc-600' },
  { key: 'rose', label: 'Rose', bgClass: 'bg-rose-50 dark:bg-rose-500/15', swatchLight: 'bg-rose-200', swatchDark: 'dark:bg-rose-700' },
  { key: 'pink', label: 'Pink', bgClass: 'bg-pink-50 dark:bg-pink-500/15', swatchLight: 'bg-pink-200', swatchDark: 'dark:bg-pink-700' },
  { key: 'fuchsia', label: 'Fuchsia', bgClass: 'bg-fuchsia-50 dark:bg-fuchsia-500/15', swatchLight: 'bg-fuchsia-200', swatchDark: 'dark:bg-fuchsia-700' },
  { key: 'yellow', label: 'Yellow', bgClass: 'bg-yellow-50 dark:bg-yellow-500/15', swatchLight: 'bg-yellow-200', swatchDark: 'dark:bg-yellow-700' },
  { key: 'orange', label: 'Orange', bgClass: 'bg-orange-50 dark:bg-orange-500/15', swatchLight: 'bg-orange-200', swatchDark: 'dark:bg-orange-700' },
  { key: 'red', label: 'Red', bgClass: 'bg-red-50 dark:bg-red-500/15', swatchLight: 'bg-red-200', swatchDark: 'dark:bg-red-700' },
];

/**
 * Get the Tailwind background class string for a given color key.
 * Returns empty string if color_key is null/undefined (no color assigned).
 */
export function getColorClasses(colorKey) {
  if (!colorKey) return '';
  const color = SESSION_COLORS.find(c => c.key === colorKey);
  return color ? color.bgClass : '';
}

/**
 * Get the color entry by key.
 */
export function getColorByKey(colorKey) {
  return SESSION_COLORS.find(c => c.key === colorKey) || null;
}
