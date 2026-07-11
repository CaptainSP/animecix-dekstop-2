import { Client } from '@xhayper/discord-rpc';
import { getLastTitleId } from '../network/request-handler';

export const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

export interface EpisodeData {
  title: string;
  seasonNumber?: string;
  episodeNumber?: string;
  translator?: string;
  isPlaying: boolean;
  startTimestamp?: number;
  posterUrl?: string;
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
      buttons: [{ label: "AnimeciX'te İzle", url: getLastTitleId() ? `https://animecix.tv/titles/${getLastTitleId()}` : 'https://animecix.tv' }],
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
