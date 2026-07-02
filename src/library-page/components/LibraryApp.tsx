import React, { useState, useMemo } from 'react';
import { useLibraryData, useEpisodeData } from '../hooks/useLibraryData';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { InternetBanner } from './InternetBanner';
import { SearchBar } from './SearchBar';
import { AnimeGrid } from './AnimeGrid';
import { EmptyState } from './EmptyState';

export function LibraryApp() {
  const { animes, loading, error, refresh } = useLibraryData();
  const { isOnline } = useNetworkStatus();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedAnime, setExpandedAnime] = useState<string | null>(null);

  const filteredAnimes = useMemo(() => {
    if (!searchQuery.trim()) return animes;
    const q = searchQuery.toLowerCase();
    return animes.filter((a) => a.animeTitle.toLowerCase().includes(q));
  }, [animes, searchQuery]);

  const handleCardClick = (animeTitle: string) => {
    setExpandedAnime((prev) => (prev === animeTitle ? null : animeTitle));
  };

  const handleGoToWebsite = async () => {
    await window.animecix?.hideLibrary();
  };

  const handleDeleteEpisode = async (episodeId: string, source: 'download' | 'cache') => {
    if (source === 'download') {
      await window.animecix?.deleteDownload(episodeId);
    } else {
      await window.animecix?.deleteCache(episodeId);
    }
    refresh();
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg-primary)',
      }}>
        <div className="spinner" aria-label="Yükleniyor" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)',
        color: 'var(--text-muted)', fontSize: 14, gap: 8,
      }}>
        <span>Kütüphane yüklenemedi. Uygulamayı yeniden başlatın.</span>
      </div>
    );
  }

  const isWindows = navigator.platform.startsWith('Win');
  const titlebarOffset = isWindows ? 40 : 0;

  return (
    <div style={{
      background: 'var(--bg-primary)',
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {!isOnline && <div className="drag-region" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 48 + titlebarOffset, zIndex: 999,
      }} />}
      {isOnline && <InternetBanner onGoToWebsite={handleGoToWebsite} />}

      <div style={{
        padding: '24px 32px 16px',
        paddingTop: (isOnline ? 72 : 56) + titlebarOffset,
      }}>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>

      <div
        className="library-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '0 32px 32px',
        }}
      >
        {filteredAnimes.length === 0 ? (
          <EmptyState hasSearch={searchQuery.length > 0} />
        ) : (
          <AnimeGrid
            animes={filteredAnimes}
            expandedAnime={expandedAnime}
            onCardClick={handleCardClick}
            onDeleteEpisode={handleDeleteEpisode}
          />
        )}
      </div>
    </div>
  );
}
