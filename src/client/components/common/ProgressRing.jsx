// ProgressRing: a circular progress indicator with the percentage in the middle
// (like "Overall Progress 67%" in the UI prototype).
//
// Props:
//   value   number  percentage 0-100
//   size    number  diameter in pixels (default 140)
//   stroke  number  ring thickness in pixels (default 12)
//   label   string  small text under the percentage (e.g. "Project Completion")
//
// Example: <ProgressRing value={67} label="Project Completion" />
export default function ProgressRing({ value = 0, size = 140, stroke = 12, label }) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // The colored part of the circle is a dash whose length matches the percentage
  const dash = (percent / 100) * circumference;

  return (
    <div
      className="progress-ring"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || 'Progress'}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="progress-ring-track" cx={center} cy={center} r={radius} strokeWidth={stroke} />
        <circle
          className="progress-ring-value"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="progress-ring-text">
        <strong>{percent}%</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}
