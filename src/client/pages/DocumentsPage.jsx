// DocumentsPage: a group's project documents and submitted files (FR-16, FR-4, UC4).
// - Students always see their own group; staff choose a group (kept in the URL as ?groupId=).
// - Everyone except examiners can upload documents; everyone in the group can download.
// - An archived project (FR-8) is read-only: only an administrator can still upload or delete.
// - Files can be filtered by category and searched by name.
import { useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import GroupSelect from '../components/common/GroupSelect.jsx';
import Card from '../components/common/Card.jsx';
import Tabs from '../components/common/Tabs.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Icon from '../components/common/Icon.jsx';
import UploadDocumentCard from '../components/documents/UploadDocumentCard.jsx';
import FilesTable from '../components/documents/FilesTable.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useGroupParam } from '../hooks/useGroupParam.js';
import { useMyGroups } from '../hooks/useMyGroups.js';
import { getFiles } from '../api/files.js';
import { isAdmin, isExaminer, isStudent } from '../config/roles.js';
import { formatFileSize, plural, timeAgo } from '../utils/format.js';
import '../styles/documents.css';

export default function DocumentsPage() {
  const { user } = useAuth();
  const student = isStudent(user.role);

  // Students always use their own group; staff pick one (saved in ?groupId=)
  const [paramGroupId, setGroupId] = useGroupParam();
  const groupId = student ? user.groupId : paramGroupId;

  // An archived project is kept as it is (FR-8): only an administrator may still change it
  const { groups } = useMyGroups();
  const isArchived =
    !isAdmin(user.role) && groups.find((group) => group.id === groupId)?.projectStatus === 'Archived';

  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const { data, loading, error, reload, setData } = useApi(
    () => (groupId ? getFiles({ groupId }) : Promise.resolve([])),
    [groupId]
  );
  const files = data || [];

  const canUpload = Boolean(groupId) && !isExaminer(user.role) && !isArchived;

  const header = (
    <PageHeader
      title="Documents"
      subtitle="Upload, download and manage your project's documents and submitted files."
    />
  );

  // A student who has not been placed in a group yet
  if (student && !user.groupId) {
    return (
      <>
        {header}
        <EmptyState
          icon="folder"
          title="You are not in a group yet"
          message="Your group's documents will appear here once the administrator adds you to a project group."
        />
      </>
    );
  }

  // Category tabs with counts, then the search box (both filter the list in the browser)
  const countOf = (name) => files.filter((file) => file.category === name).length;
  const tabs = [
    { value: 'all', label: 'All files', count: files.length },
    { value: 'Document', label: 'Documents', count: countOf('Document') },
    { value: 'Submission', label: 'Submissions', count: countOf('Submission') },
  ];
  if (countOf('Showcase') > 0) tabs.push({ value: 'Showcase', label: 'Showcase', count: countOf('Showcase') });

  const searchText = search.trim().toLowerCase();
  const visibleFiles = files.filter(
    (file) =>
      (category === 'all' || file.category === category) &&
      (!searchText || file.fileName.toLowerCase().includes(searchText))
  );

  const totalSize = files.reduce((sum, file) => sum + (file.fileSize || 0), 0);
  const latest = files[0]; // the list is sorted newest first

  function renderFiles() {
    if (loading) return <Loading text="Loading files..." />;
    if (error) return <ErrorMessage error={error} onRetry={reload} />;
    if (files.length === 0) {
      return (
        <EmptyState
          icon="folder"
          title="No files yet"
          message={
            canUpload
              ? 'Upload the first document for your group.'
              : 'Documents uploaded by the group will appear here.'
          }
        />
      );
    }
    if (visibleFiles.length === 0) {
      return <EmptyState compact icon="search" title="No matching files" message="Try another name or category." />;
    }
    return (
      <FilesTable
        files={visibleFiles}
        onDeleted={(fileId) => setData((list) => (list || []).filter((file) => file.id !== fileId))}
      />
    );
  }

  return (
    <>
      {header}

      {!student && (
        <div className="doc-group-bar">
          <GroupSelect value={paramGroupId} onChange={setGroupId} />
        </div>
      )}

      {!groupId ? (
        <EmptyState
          icon="folder"
          title="Choose a group"
          message="Select a group above to see its documents. If the list is empty, no group has been assigned to you yet."
        />
      ) : (
        <div className="split doc-layout">
          <Card title="Project files" icon="folder" flush className="doc-files-card">
            <div className="doc-toolbar">
              <Tabs tabs={tabs} active={category} onChange={setCategory} ariaLabel="Filter by category" />
              <div className="input-with-icon doc-search">
                <Icon name="search" size={16} />
                <label htmlFor="doc-search" className="sr-only">
                  Search files by name
                </label>
                <input
                  id="doc-search"
                  type="search"
                  placeholder="Search by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {renderFiles()}
          </Card>

          <div className="stack doc-side">
            {canUpload ? (
              <UploadDocumentCard groupId={groupId} onUploaded={reload} />
            ) : (
              <div className="alert alert-info">
                {isArchived
                  ? 'This project is archived. Its files can be viewed and downloaded only.'
                  : "Examiners can view and download the group's files. Uploading is done by the students and the supervisor."}
              </div>
            )}

            {!loading && !error && files.length > 0 && (
              <Card title="Summary" icon="archive" iconColor="navy">
                <div className="doc-stats">
                  <div className="doc-stat">
                    <strong>{files.length}</strong>
                    <span>{files.length === 1 ? 'File' : 'Files'}</span>
                  </div>
                  <div className="doc-stat">
                    <strong>{formatFileSize(totalSize)}</strong>
                    <span>Total size</span>
                  </div>
                </div>
                {latest && (
                  <p className="doc-latest">
                    Last upload: <strong>{latest.fileName}</strong> {timeAgo(latest.uploadDate)}
                    {latest.uploadedBy && ` by ${latest.uploadedBy.name}`}
                  </p>
                )}
                <p className="muted small mb-0">
                  {plural(countOf('Document'), 'document')} and {plural(countOf('Submission'), 'submitted file')}.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
