// FormField: a label + input + optional hint/error, laid out the same way in every form.
//
// Props:
//   id        string    id of the input; the label points to it (required)
//   label     string    visible label text (required - every input needs a label)
//   required  boolean   shows a red * after the label (and passes `required` to the input)
//   hint      string    optional grey help text under the input
//   error     string    optional red error text under the input
//   as        string    when no children are given: "input" (default) or "textarea"
//   children  node      your own input/select/textarea (give it the same id!)
//   className string    extra classes for the wrapper
//   ...rest             any other props go to the built-in input (type, value, onChange...)
//
// Examples:
//   <FormField id="title" label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
//   <FormField id="desc" label="Description" as="textarea" rows={4} value={desc} onChange={...} />
//   <FormField id="priority" label="Priority">
//     <select id="priority" value={priority} onChange={...}>...</select>
//   </FormField>
export default function FormField({
  id,
  label,
  required = false,
  hint,
  error,
  as = 'input',
  children,
  className = '',
  ...rest
}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');

  // Build the input ourselves only when the page did not pass its own
  let control = children;
  if (!children) {
    const Tag = as === 'textarea' ? 'textarea' : 'input';
    control = (
      <Tag
        id={id}
        name={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...rest}
      />
    );
  }

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`.trim()}>
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {' '}*
          </span>
        )}
      </label>
      {control}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
