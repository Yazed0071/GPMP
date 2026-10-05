// ResourceFormModal: pop-up form to add or edit a learning resource (FR-17).
//
// Props:
//   open      boolean
//   onClose   function
//   resource  object|null   null = new resource, otherwise the one being edited
//   onSaved   function(savedResource, isNew)
import { useEffect, useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import { createResource, updateResource } from '../../api/resources.js';
import { isWebLink } from '../../utils/validation.js';
import { RESOURCE_CATEGORIES } from './categories.js';

const EMPTY_FORM = { title: '', url: '', category: '', description: '' };

export default function ResourceFormModal({ open, onClose, resource, onSaved }) {
  const isNew = !resource;
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Fill the form every time the modal opens
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFormError('');
    setForm(
      resource
        ? { title: resource.title, url: resource.url, category: resource.category, description: resource.description || '' }
        : EMPTY_FORM
    );
  }, [open, resource]);

  function setField(name, value) {
    setForm((old) => ({ ...old, [name]: value }));
    setErrors((old) => ({ ...old, [name]: undefined }));
  }

  function validate() {
    const found = {};
    if (!form.title.trim()) found.title = 'Title is required';
    if (!form.url.trim()) found.url = 'Link is required';
    else if (!isWebLink(form.url)) found.url = 'The link must start with http:// or https://';
    if (!form.category) found.category = 'Please choose a category';
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    if (!validate()) return;

    const body = {
      title: form.title.trim(),
      url: form.url.trim(),
      category: form.category,
      description: form.description.trim(),
    };
    setSaving(true);
    try {
      const saved = isNew ? await createResource(body) : await updateResource(resource.id, body);
      onSaved(saved, isNew);
    } catch (err) {
      // Show field problems next to the field, anything else at the top
      if (err.details?.field === 'url') setErrors((old) => ({ ...old, url: err.message }));
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isNew ? 'Add resource' : 'Edit resource'} closeOnBackdrop={false}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert alert-error">{formError}</div>}

        <FormField
          id="res-title"
          label="Title"
          required
          maxLength={200}
          placeholder="e.g. React official documentation"
          value={form.title}
          onChange={(e) => setField('title', e.target.value)}
          error={errors.title}
        />

        <div className="form-row">
          <FormField
            id="res-url"
            label="Link"
            type="url"
            required
            maxLength={500}
            placeholder="https://..."
            value={form.url}
            onChange={(e) => setField('url', e.target.value)}
            error={errors.url}
          />
          <FormField id="res-category" label="Category" required error={errors.category}>
            <select
              id="res-category"
              value={form.category}
              onChange={(e) => setField('category', e.target.value)}
              aria-invalid={errors.category ? true : undefined}
            >
              <option value="">Choose a category</option>
              {RESOURCE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField
          id="res-description"
          label="Description"
          as="textarea"
          rows={4}
          maxLength={5000}
          hint="Optional: what the resource is and how it helps with the graduation project."
          value={form.description}
          onChange={(e) => setField('description', e.target.value)}
        />

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isNew ? 'Add resource' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
