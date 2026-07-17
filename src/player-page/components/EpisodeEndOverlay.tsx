import { useEffect, useState } from 'react';

const AUTO_SKIP_SECONDS = 10;

interface EpisodeEndOverlayProps {
  animeTitle: string;
  hasNextEpisode: boolean;
  onNextEpisode: () => void;
  onDismiss: () => void;
}

export function EpisodeEndOverlay({
  animeTitle,
  hasNextEpisode,
  onNextEpisode,
  onDismiss,
}: EpisodeEndOverlayProps) {
  const [countdown, setCountdown] = useState(AUTO_SKIP_SECONDS);

  useEffect(() => {
    if (!hasNextEpisode) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onNextEpisode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasNextEpisode, onNextEpisode]);

  return (
    <div className="episode-end-overlay" onClick={onDismiss}>
      <div className="episode-end-title">{animeTitle}</div>

      {hasNextEpisode && (
        <button
          className="episode-end-next-btn"
          onClick={(e) => {
            e.stopPropagation();
            onNextEpisode();
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
          <span>Yeni Bölüme Geç</span>
          <span className="episode-end-countdown">{countdown}</span>
        </button>
      )}
    </div>
  );
}
