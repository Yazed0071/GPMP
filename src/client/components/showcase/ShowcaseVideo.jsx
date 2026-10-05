// ShowcaseVideo: plays a project's protected showcase video (FR-18).
// The video is downloaded with the login token (useBlobUrl) and played from a temporary
// blob: address; the address is freed automatically when this component disappears.
//
// Props:
//   projectId  number  the project whose video to play
//   title      string  used for the accessible name of the player
import Loading from '../common/Loading.jsx';
import ErrorMessage from '../common/ErrorMessage.jsx';
import { useBlobUrl } from '../../hooks/useBlobUrl.js';
import { showcaseVideoPath } from '../../api/showcase.js';

export default function ShowcaseVideo({ projectId, title }) {
  const { url, loading, error } = useBlobUrl(showcaseVideoPath(projectId));

  if (loading) {
    return (
      <div className="show-video-placeholder">
        <Loading text="Loading video..." />
      </div>
    );
  }
  if (error) return <ErrorMessage error={error} title="The video could not be loaded" />;

  return (
    <video className="show-video" src={url} controls preload="metadata" aria-label={`Showcase video: ${title}`}>
      Your browser cannot play this video.
    </video>
  );
}
