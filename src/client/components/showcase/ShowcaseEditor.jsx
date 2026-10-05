// ShowcaseEditor: lets the students of a completed project upload a showcase video and write
// a description of the finished project (FR-18). Shown on the My Project page.
//
// Props:
//   project    object    { id, title, showcaseDescription, academicYear, hasVideo }
//   onSaved    function  called after a save or a removal (e.g. reload the page)
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import FormField from '../common/FormField.jsx';
import FileDrop from '../common/FileDrop.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import Icon from '../common/Icon.jsx';
import ShowcaseVideo from './ShowcaseVideo.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { removeShowcaseVideo, updateShowcase } from '../../api/showcase.js';

export default function ShowcaseEditor({ project, onSaved }) {
  const toast = useToast();
  const [description, setDescription] = useState(project.showcaseDescription || '');
  const [academicYear, setAcademicYear] = useState(project.academicYear || '');
  const [videoFiles, setVideoFiles] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Changing this number re-mounts the player so it loads the newly uploaded video
  const [videoVersion, setVideoVersion] = useState(0);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!description.trim()) {
      setError('Please write a short description of your project.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateShowcase(project.id, {
        showcaseDescription: description.trim(),
        academicYear: academicYear.trim(),
        video: videoFiles[0],
      });
      toast.success(videoFiles.length > 0 ? 'Showcase video uploaded.' : 'Showcase description saved.');
      setVideoFiles([]);
      setVideoVersion((version) => version + 1);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveVideo() {
    await removeShowcaseVideo(project.id);
    toast.success('Showcase video removed.');
    onSaved?.();
  }

  return (
    <Card
      title="Project showcase"
      subtitle="Share your finished project with a video and a written description."
      icon="trophy"
      iconColor="amber"
      actions={
        <Link to={`/showcase?search=${encodeURIComponent(project.title)}`} className="btn btn-secondary btn-small">
          View in showcase
        </Link>
      }
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        {error && <div className="alert alert-error">{error}</div>}

        {project.hasVideo && (
          <div className="show-editor-video">
            <span className="label">Current video</span>
            <ShowcaseVideo key={videoVersion} projectId={project.id} title={project.title} />
            <div>
              <ConfirmButton
                className="btn btn-secondary btn-small"
                confirmLabel="Remove video"
                message="Remove the showcase video? The description stays."
                onConfirm={handleRemoveVideo}
              >
                <Icon name="trash" size={16} /> Remove video
              </ConfirmButton>
            </div>
          </div>
        )}

        <FormField
          id="showcase-description"
          label="Showcase description"
          as="textarea"
          rows={6}
          required
          maxLength={5000}
          value={description}
          hint="What did you build, which technologies did you use and what were the results?"
          onChange={(event) => setDescription(event.target.value)}
        />
        <FormField
          id="showcase-year"
          label="Academic year"
          value={academicYear}
          placeholder="2026-2027"
          onChange={(event) => setAcademicYear(event.target.value)}
        />
        <FileDrop
          id="showcase-video"
          kind="video"
          label={project.hasVideo ? 'Replace the video (optional)' : 'Showcase video'}
          files={videoFiles}
          onFiles={(files) => setVideoFiles(files.slice(0, 1))}
          onRemove={() => setVideoFiles([])}
          disabled={saving}
        />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? (videoFiles.length > 0 ? 'Uploading video...' : 'Saving...') : 'Save showcase'}
          </button>
        </div>
      </form>
    </Card>
  );
}
