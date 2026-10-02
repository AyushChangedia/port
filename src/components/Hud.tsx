import { profile } from '../data/profile';
import { placeById } from '../data/world';
import Minimap, { type Pose } from './Minimap';
import './hud.css';

interface Props {
  poseRef: React.MutableRefObject<Pose>;
  nearId: string | null;
  showHint: boolean;
  onOpenNear: () => void;
  onOpenDirectory: () => void;
  onReadMode: () => void;
  onPickPlace: (placeId: string) => void;
}

/**
 * The heads-up layer.
 *
 * Every piece of it sits on an opaque chip. Nothing is text-over-scene.
 */
export default function Hud({
  poseRef,
  nearId,
  showHint,
  onOpenNear,
  onOpenDirectory,
  onReadMode,
  onPickPlace,
}: Props) {
  const near = nearId ? placeById(nearId) : undefined;

  return (
    <div className="hud">
      <div className="hud-chip hud-mark">
        {/* The full name has room on a desktop; a phone gets the short one. */}
        <span className="hud-name hud-name--full">{profile.fullName}</span>
        <span className="hud-name hud-name--short">
          {profile.firstName} {profile.lastName}
        </span>
        <span className="hud-role">{profile.role}</span>
      </div>

      <div className="hud-tools">
        <button type="button" className="btn" onClick={onOpenDirectory}>
          Places <span className="kbd">M</span>
        </button>
        <button type="button" className="btn" onClick={onReadMode}>
          <span className="hud-label--full">Read as page</span>
          <span className="hud-label--short">Read</span>
        </button>
      </div>

      <div className="hud-map">
        <Minimap poseRef={poseRef} nearId={nearId} onPick={onPickPlace} />
        <p className="hud-map-label">Click the map to travel</p>
      </div>

      {/* The prompt only exists when there is something to open. */}
      {near && (
        <button type="button" className="hud-prompt" onClick={onOpenNear}>
          <span className="hud-prompt-name">{near.name}</span>
          <span className="hud-prompt-action">
            Open <span className="kbd">E</span>
          </span>
        </button>
      )}

      {/* Controls, stated once. The keyboard rows are hidden on touch, where
          they would be advice you cannot follow. */}
      {showHint && !near && (
        <div className="hud-chip hud-hint">
          <span className="hint-key-only">
            <span className="kbd">W</span>
            <span className="kbd">A</span>
            <span className="kbd">S</span>
            <span className="kbd">D</span> to walk
          </span>
          <span className="hint-key-only">
            <span className="kbd">Shift</span> run · <span className="kbd">Space</span> jump,
            hold to glide
          </span>
          <span>Drag to look</span>
          <span>
            <span className="hint-fine">Click</span>
            <span className="hint-coarse">Tap</span> anything to go there
          </span>
        </div>
      )}
    </div>
  );
}
