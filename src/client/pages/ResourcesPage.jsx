// ResourcesPage: tutorials, guides and recommended tools for students (FR-17, UI fig 45).
// Everyone can browse, filter by category and search. Supervisors and administrators add
// resources; administrators can change any resource, supervisors the ones they added.
import { useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Icon from '../components/common/Icon.jsx';
import ResourceCard from '../components/resources/ResourceCard.jsx';
import ResourceFormModal from '../components/resources/ResourceFormModal.jsx';
import { RESOURCE_CATEGORIES } from '../components/resources/categories.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getResources, deleteResource } from '../api/resources.js';
import '../styles/resources.css';

export default function ResourcesPage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canAdd = hasRole('Supervisor', 'Administrator');

  const { data, loading, error, reload, setData } = useApi(() => getResources(), []);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // the resource being edited, null = new

  const resources = data || [];

  // ----- Filtering (on this page, the list is small) -----
  const text = search.trim().toLowerCase();
  const shown = resources.filter((r) => {
    if (category !== 'all' && r.category !== category) return false;
    if (!text) return true;
    return [r.title, r.description, r.url].some((value) => value?.toLowerCase().includes(text));
  });
  const countOf = (value) => resources.filter((r) => r.category === value).length;

  // ----- Actions -----
  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(resource) {
    setEditing(resource);
    setFormOpen(true);
  }

  function handleSaved(saved, isNew) {
    setFormOpen(false);
    setData((list) => (isNew ? [saved, ...(list || [])] : list?.map((r) => (r.id === saved.id ? saved : r))));
    toast.success(isNew ? 'Resource added' : 'Resource updated');
  }

  async function handleDelete(resource) {
    await deleteResource(resource.id);
    setData((list) => list?.filter((r) => r.id !== resource.id));
    toast.success('Resource deleted');
  }

  // ----- Render -----
  let content;
  if (loading) {
    content = <Loading text="Loading resources..." />;
  } else if (error) {
    content = <ErrorMessage error={error} onRetry={reload} />;
  } else if (resources.length === 0) {
    content = (
      <EmptyState
        icon="book"
        title="No resources yet"
        message={canAdd ? 'Add the first tutorial, guide or tool for your students.' : 'Helpful links will appear here soon.'}
        action={
          canAdd && (
            <button type="button" className="btn btn-primary" onClick={openNew}>
              <Icon name="plus" size={18} /> Add resource
            </button>
          )
        }
      />
    );
  } else if (shown.length === 0) {
    content = (
      <EmptyState
        icon="search"
        title="No resources found"
        message="Try another word or category."
        action={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearch('');
              setCategory('all');
            }}
          >
            Show all resources
          </button>
        }
      />
    );
  } else {
    content = (
      <div className="res-grid">
        {shown.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} onEdit={openEdit} onDelete={handleDelete} />
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Resources & Tools"
        subtitle="Guides, tutorials and tools to help you through every stage of your graduation project."
        actions={
          canAdd && (
            <button type="button" className="btn btn-primary" onClick={openNew}>
              <Icon name="plus" size={18} /> Add resource
            </button>
          )
        }
      />

      {resources.length > 0 && (
        <div className="res-toolbar">
          <div className="res-filters" role="group" aria-label="Filter by category">
            <button
              type="button"
              className={category === 'all' ? 'res-chip res-chip-active' : 'res-chip'}
              onClick={() => setCategory('all')}
              aria-pressed={category === 'all'}
            >
              All resources <span className="res-chip-count">{resources.length}</span>
            </button>
            {RESOURCE_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                className={category === c.value ? 'res-chip res-chip-active' : 'res-chip'}
                onClick={() => setCategory(c.value)}
                aria-pressed={category === c.value}
              >
                <span aria-hidden="true">{c.emoji}</span> {c.label}
                <span className="res-chip-count">{countOf(c.value)}</span>
              </button>
            ))}
          </div>

          <div className="res-search">
            <label htmlFor="res-search" className="sr-only">
              Search resources
            </label>
            <div className="input-with-icon">
              <Icon name="search" size={16} />
              <input
                id="res-search"
                type="search"
                placeholder="Search resources..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {content}

      {canAdd && (
        <ResourceFormModal open={formOpen} onClose={() => setFormOpen(false)} resource={editing} onSaved={handleSaved} />
      )}
    </>
  );
}
