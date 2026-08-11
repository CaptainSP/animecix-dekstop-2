import type { FrameInterpolationState } from '../hooks/useFrameInterpolation';

interface Props {
  frameInterp: FrameInterpolationState;
}

/**
 * FrameInterpolationMenu — settings menu item for 60fps frame interpolation toggle.
 * Follows the same vds-menu-item pattern as FlatSettingsMenu items.
 */
export function FrameInterpolationMenu({ frameInterp }: Props) {
  if (!frameInterp.supported) return null;

  return (
    <div className="vds-menu-item">
      <svg className="vds-menu-item-icon vds-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z" />
      </svg>
      <div className="vds-menu-item-label">Kare Arttırma</div>
      <button
        className={`ve-switch-compact ${frameInterp.active ? 'on' : ''} ${frameInterp.loading ? 'loading' : ''}`}
        onClick={() => frameInterp.toggle()}
        disabled={frameInterp.loading}
        role="switch"
        aria-checked={frameInterp.active}
      >
        <span className="ve-switch-compact-thumb" />
      </button>
    </div>
  );
}
