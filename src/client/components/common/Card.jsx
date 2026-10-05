// Card: a white rounded box that groups related content (like the prototype's panels).
//
// Props:
//   title      string|node  optional heading shown in the card header
//   subtitle   string|node  optional small text under the title
//   icon       string       optional Icon name shown in a colored tile before the title
//   iconColor  string       tile color: teal (default), blue, green, amber, red, purple, navy
//   actions    node         optional buttons/links on the right of the header (e.g. "View all")
//   flush      boolean      true = no padding inside the body (for tables and edge-to-edge lists)
//   className  string       extra CSS classes for the outer box
//   children   node         the card content
//
// Example:
//   <Card title="Recent Activity" actions={<Link to="/tasks">View tasks</Link>}>...</Card>
import Icon from './Icon.jsx';

export default function Card({
  title,
  subtitle,
  icon,
  iconColor = 'teal',
  actions,
  flush = false,
  className = '',
  children,
  ...rest
}) {
  const hasHeader = title || subtitle || actions || icon;

  return (
    <section className={`card ${className}`.trim()} {...rest}>
      {hasHeader && (
        <div className="card-header">
          {icon && (
            <span className={`icon-tile tile-${iconColor}`}>
              <Icon name={icon} size={18} />
            </span>
          )}
          <div className="card-heading">
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'card-body card-body-flush' : 'card-body'}>{children}</div>
    </section>
  );
}
