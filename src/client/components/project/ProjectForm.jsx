// ProjectForm: the title / description / academic year form used to create a project
// (inside a card) and to edit it (inside a modal) - FR-3.
//
// Props:
//   initialValues  object    { title, description, academicYear } (empty for a new project)
//   submitLabel    string    text of the submit button
//   onSubmit       function  async ({ title, description, academicYear }) => ...; a thrown
//                            error's message is shown at the top of the form
//   onCancel       function  optional; shows a Cancel button
import { useState } from 'react';
import FormField from '../common/FormField.jsx';

// "2026-2027": four digits, a dash, and the next year
function isAcademicYear(value) {
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  return Boolean(match) && Number(match[2]) === Number(match[1]) + 1;
}

export default function ProjectForm({ initialValues = {}, submitLabel = 'Save', onSubmit, onCancel }) {
  const [title, setTitle] = useState(initialValues.title || '');
  const [description, setDescription] = useState(initialValues.description || '');
  const [academicYear, setAcademicYear] = useState(initialValues.academicYear || '');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Returns an object of field -> message for every problem (empty when all is fine)
  function validate() {
    const found = {};
    if (!title.trim()) found.title = 'Please enter the project title';
    if (!description.trim()) found.description = 'Please describe the project';
    if (academicYear.trim() && !isAcademicYear(academicYear.trim())) {
      found.academicYear = 'Academic year must look like 2026-2027';
    }
    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setFormError('');
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        academicYear: academicYear.trim() || undefined,
      });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formError && <div className="alert alert-error">{formError}</div>}

      <FormField
        id="project-title"
        label="Project title"
        required
        maxLength={200}
        value={title}
        error={errors.title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="e.g. Smart Campus Navigation App"
      />
      <FormField
        id="project-description"
        label="Description"
        as="textarea"
        rows={5}
        required
        maxLength={5000}
        value={description}
        error={errors.description}
        hint="What problem does the project solve, who will use it and what will you build?"
        onChange={(event) => setDescription(event.target.value)}
      />
      <FormField
        id="project-year"
        label="Academic year"
        value={academicYear}
        error={errors.academicYear}
        hint="Leave empty to use the current academic year."
        placeholder="2026-2027"
        onChange={(event) => setAcademicYear(event.target.value)}
      />

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
