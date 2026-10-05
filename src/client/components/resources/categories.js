// Resource categories (FR-17). The values must match the CHECK constraint on resource.Category.
export const RESOURCE_CATEGORIES = [
  { value: 'Tutorial', label: 'Tutorials', emoji: '🎓' },
  { value: 'Tool', label: 'Tools', emoji: '🛠️' },
  { value: 'Framework', label: 'Frameworks', emoji: '🧩' },
  { value: 'Library', label: 'Libraries', emoji: '📚' },
  { value: 'Guide', label: 'Guides', emoji: '🧭' },
];

// { value, label, emoji } of a category (a safe default for unknown values)
export function categoryInfo(value) {
  return RESOURCE_CATEGORIES.find((c) => c.value === value) || { value, label: value, emoji: '🔗' };
}

// "https://www.figma.com/file" -> "figma.com" (shown on the card)
export function hostName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
