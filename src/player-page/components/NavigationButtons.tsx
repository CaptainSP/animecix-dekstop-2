import { postToParent } from '../hooks/useParentMessages';
import { useMediaState } from '@vidstack/react';

interface NavigationButtonsProps {
  hasNext: boolean;
  hasPrev: boolean;
}

export function NavigationButtons({ hasNext, hasPrev }: NavigationButtonsProps) {
  const fullscreen = useMediaState('fullscreen');
  if (!fullscreen) return null;
  if (!hasNext && !hasPrev) return null;

  return (
    <>
      {hasPrev && (
        <button
          className="nav-btn nav-btn-prev"
          aria-label="Onceki bolum"
          onClick={() => postToParent('prev')}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>
      )}
      {hasNext && (
        <button
          className="nav-btn nav-btn-next"
          aria-label="Sonraki bolum"
          onClick={() => postToParent('next')}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      )}
    </>
  );
}
