import { Client } from '@xhayper/discord-rpc';

export const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

// Public website base for the "Watch on AnimeciX" presence button. Always the
// production site — the button is for the viewer's Discord friends, not the
// local dev build, so it must not depend on VITE_SITE_URL (localhost in dev).
const WATCH_BASE_URL = 'https://animecix.tv';

export interface EpisodeData {
  title: string;
  // Anime title id (maps to animecix.tv/titles/:id). Threaded through the
  // episode:update presence payload from the website — the authoritative id of
  // the episode being watched, so the button link never goes stale.
  titleId?: string | number;
  seasonNumber?: string;
  episodeNumber?: string;
  translator?: string;
  isPlaying: boolean;
  startTimestamp?: number;
  posterUrl?: string;
}

/**
 * Pure function: build the "Watch on AnimeciX" presence button URL.
 * Deep-links to the watched title when a titleId is known, otherwise falls
 * back to the homepage (e.g. before the website has supplied a titleId).
 */
export function buildWatchButtonUrl(titleId?: string | number): string {
  return titleId ? `${WATCH_BASE_URL}/titles/${titleId}` : WATCH_BASE_URL;
}

/** Pure function: format episode state string for Discord */
export function formatEpisodeState(
  season?: string,
  episode?: string,
  translator?: string,
): string {
  if (!season || !episode) return '';
  const s = season.padStart(2, '0');
  const e = episode.padStart(2, '0');
  const base = `S${s}E${e}`;
  return translator ? `${base} - ${translator}` : base;
}

export class DiscordService {
  private client: Client;
  private connected = false;

  constructor() {
    this.client = new Client({ clientId: CLIENT_ID });
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.client.once('ready', () => {
        this.connected = true;
      });
      await this.client.login();
    } catch {
      // Silent no-op per locked decision -- Discord not running
      this.connected = false;
    }
  }

  updateActivity(data: EpisodeData): void {
    if (!this.connected) return;

    const state = data.isPlaying ? 'İzleniyor' : 'Duraklatıldı';
    const episodeState = formatEpisodeState(
      data.seasonNumber,
      data.episodeNumber,
      data.translator,
    );

    this.client.user?.setActivity({
      details: data.title,
      state: episodeState ? `${episodeState} - ${state}` : state,
      startTimestamp: data.isPlaying ? data.startTimestamp : undefined,
      largeImageKey: data.posterUrl || 'animecix-logo',
      smallImageKey: 'animecix-logo',
      largeImageText: data.title,
      smallImageText: 'AnimeciX',
      type: 3, // Watching
      // Deep-link to the watched title; fall back to the homepage until the
      // website supplies a titleId in the presence payload.
      buttons: [{ label: "AnimeciX'te İzle", url: buildWatchButtonUrl(data.titleId) }],
    }).catch(() => {
      // Silent fail -- connection may have dropped
      this.connected = false;
    });
  }

  setIdle(): void {
    if (!this.connected) return;
    this.client.user?.setActivity({
      state: 'Bakınıyor...',
      largeImageKey: 'animecix-logo',
      smallImageText: 'AnimeciX',
      type: 3,
    }).catch(() => {
      this.connected = false;
    });
  }

  destroy(): void {
    if (!this.connected) return;
    this.client.user?.clearActivity().catch(() => {});
    this.connected = false;
  }
}
