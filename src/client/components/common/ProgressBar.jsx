// ProgressBar: a horizontal bar that fills from 0% to 100%.
//
// Props:
//   value      number   percentage 0-100 (values outside are clamped)
//   label      string   optional text above the bar (e.g. "Project progress")
//   showValue  boolean  true = show "67%" next to the label
//   color      string   teal (default), green, blue, amber, red, purple
//   size       string   "medium" (default) or "small" (thinner bar)
//
// Example: <ProgressBar value={67} label="Overall progress" showValue />
export default function ProgressBar({
  value = 0,
  label,
  showValue = false,
  color = 'teal',
  size = 'medium',
}) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

  return (
    <div className="progress-wrap">
      {(label || showValue) && (
        <div className="progress-label">
          {label && <span>{label}</span>}
          {showValue && <strong>{percent}%</strong>}
        </div>
      )}
      <div
        className={`progress progress-${size}`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        <div className={`progress-bar progress-${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
