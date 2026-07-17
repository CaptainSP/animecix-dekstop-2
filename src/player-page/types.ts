export interface Video {
  _id: string;
  durationDifference?: number;
  duration: number;
  title_id: string;
  title_name?: string;
  season_number: string;
  episode_number: string;
  ratio?: number;
  hls?: string;
  urls: { label: string; url: string; size: number }[];
  subs: { id: number; language: string; url: string; name: string }[];
  translator: string;
}

export interface MusicData {
  title: string;
  artist: string;
  album?: string;
  spotify_url?: string;
  apple_music_url?: string;
  cover_art?: string;
}

export interface SkipMeta {
  intro?: { from: number; to: number; count?: number };
  outro?: { from: number; to: number; count?: number };
  music?: MusicData;
  outro_music?: MusicData;
  [key: string]: { from: number; to: number; count?: number } | MusicData | undefined;
}

// Dual source interface for Phase 3 offline readiness (per D-06)
export interface PlayerSource {
  type: 'hls' | 'mp4' | 'local';
  url: string;
  qualities?: { label: string; url: string; height: number; width: number; size: number }[];
}
