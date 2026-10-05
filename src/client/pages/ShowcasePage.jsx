// ShowcasePage: browse completed and archived graduation projects with their final documents
// and demo videos, filtered by academic year and searched by title, topic or supervisor
// (FR-8, FR-18, FR-19, UI fig 43). The search and year are kept in the address (?search=&year=)
// so other pages can link to a project.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../components/common/Card.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Tabs from '../components/common/Tabs.jsx';
import Icon from '../components/common/Icon.jsx';
import ShowcaseCard from '../components/showcase/ShowcaseCard.jsx';
import ShowcaseDetailModal from '../components/showcase/ShowcaseDetailModal.jsx';
import { useApi } from '../hooks/useApi.js';
import { getShowcase, getShowcaseYears } from '../api/showcase.js';
import { plural } from '../utils/format.js';
import '../styles/showcase.css';

export default function ShowcasePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const year = searchParams.get('year') || '';

  const [searchText, setSearchText] = useState(search);
  // The project shown in the detail modal: { id, title } or null
  const [openProject, setOpenProject] = useState(null);

  const { data: years } = useApi(getShowcaseYears, []);
  const { data: projects, loading, error, reload } = useApi(() => getShowcase({ year, search }), [year, search]);

  // Keep the search box in step when the address changes (e.g. a link from another page)
  useEffect(() => {
    setSearchText(search);
  }, [search]);

  // Changes some values in the address; empty values are removed
  function updateParams(changes) {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true }
    );
  }

  function handleSearch(event) {
    event.preventDefault();
    updateParams({ search: searchText.trim() });
  }

  function clearFilters() {
    setSearchText('');
    updateParams({ search: '', year: '' });
  }

  const yearTabs = [{ value: '', label: 'All Projects' }, ...(years || []).map((y) => ({ value: y, label: y }))];
  const isFiltered = Boolean(search || year);

  let content;
  if (loading) content = <Loading text="Loading projects..." />;
  else if (error) content = <ErrorMessage error={error} onRetry={reload} />;
  else if (projects.length === 0) {
    content = (
      <Card>
        <EmptyState
          icon="trophy"
          title={isFiltered ? 'No projects found' : 'No completed projects yet'}
          message={
            isFiltered
              ? 'Try other words or another academic year.'
              : 'Completed and archived graduation projects will appear here.'
          }
          action={
            isFiltered && (
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            )
          }
        />
      </Card>
    );
  } else {
    content = (
      <>
        <p className="show-results-line">
          {plural(projects.length, 'project')}
          {search && ` matching "${search}"`}
          {year && ` from ${year}`}
          {isFiltered && (
            <>
              {' · '}
              <button type="button" className="link-button" onClick={clearFilters}>
                Clear filters
              </button>
            </>
          )}
        </p>
        <div className="show-grid">
          {projects.map((project) => (
            <ShowcaseCard
              key={project.projectId}
              project={project}
              onOpen={() => setOpenProject({ id: project.projectId, title: project.title })}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <section className="hero show-hero">
        <h1>Projects Showcase</h1>
        <p>Browse completed graduation projects — with final reports, demo videos and team information.</p>
      </section>

      <form className="show-search" role="search" onSubmit={handleSearch}>
        <div className="input-with-icon">
          <Icon name="search" size={18} />
          <label htmlFor="showcase-search" className="sr-only">
            Search projects
          </label>
          <input
            id="showcase-search"
            type="search"
            placeholder="Search projects by title, topic, or supervisor..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-dark">
          Search
        </button>
      </form>

      <Tabs tabs={yearTabs} active={year} onChange={(value) => updateParams({ year: value })} ariaLabel="Academic year" />

      {content}

      <ShowcaseDetailModal
        projectId={openProject ? openProject.id : null}
        title={openProject?.title}
        onClose={() => setOpenProject(null)}
      />
    </>
  );
}
