// Avatar: a colored circle with a person's initials ("Mustafa Deeb" -> "MD").
// The color is chosen from the name, so the same person always gets the same color.
//
// Props:
//   name       string  the person's full name (required)
//   size       string  "small" (28px), "medium" (36px, default), "large" (56px)
//   className  string  extra CSS classes
//
// Example: <Avatar name={user.name} size="small" />
import { initials } from '../../utils/format.js';

const COLORS = ['teal', 'blue', 'purple', 'amber', 'green', 'navy', 'red', 'orange'];

// Turns a name into a number so it always maps to the same color
function colorFor(name = '') {
  let sum = 0;
  for (const char of String(name)) sum += char.charCodeAt(0);
  return COLORS[sum % COLORS.length];
}

export default function Avatar({ name, size = 'medium', className = '' }) {
  return (
    <span
      className={`avatar avatar-${size} avatar-${colorFor(name)} ${className}`.trim()}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
