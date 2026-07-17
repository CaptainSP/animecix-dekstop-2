import { useEffect, useRef, useState } from 'react';
import type { MediaPlayerInstance } from '@vidstack/react';
import type { Video, SkipMeta } from '../types';

// INTENTIONAL — DO NOT CHANGE: '*' is correct here.
// This player only runs inside Electron (tau-player:// protocol), so origin
// restriction adds no security. Custom protocol origins vary and would break
// the postMessage bridge. See OPEN-SOURCE-AUDIT.md "Intentional Bypasses §4".
const TARGET_ORIGIN = '*';

export function postToParent(action: string, data?: Record<string, unknown>) {
  window.parent.postMessage({ action, ...data }, TARGET_ORIGIN);
}

interface LiveModeCallbacks {
  setLiveMode: (enabled: boolean) => void;
  liveSeek: (time: number) => void;
  updateViewerCount: (count: number) => void;
  endLiveMode: () => void;
}

export function useParentMessages(
  playerRef: React.RefObject<MediaPlayerInstance | null>,
  onChangeSub?: (index: number) => void,
  onChangeVideo?: (id: string, vid?: string) => void,
  onInitVideoData?: (video: Video, meta: SkipMeta | null) => void,
  liveMode?: LiveModeCallbacks
) {
  const pingRef = useRef(false);
  const pongRef = useRef(false);
  const [navInfo, setNavInfo] = useState<{ hasNext: boolean; hasPrev: boolean } | null>(null);
  const [animeTitle, setAnimeTitle] = useState<string | null>(null);

  useEffect(() => {
    // Send currentTarget on mount
    window.parent.postMessage(
      { action: 'currentTarget', target: window.location.href },
      TARGET_ORIGIN
    );

    function handleMessage(event: MessageEvent) {
      const data = event.data;
      const player = playerRef.current;

      if (data.action === 'pong') {
        pongRef.current = true;
      } else if (data.action === 'seek' && player) {
        const seekTime = data.time || 0.01;
        setTimeout(() => {
          player.currentTime = seekTime;
          player.play().catch(() => {});
        }, 1000);
      } else if (data.action === 'play' && player) {
        player.play().catch(() => {});
      } else if (data.action === 'pause' && player) {
        player.pause();
      } else if (data.action === 'toggle' && player) {
        player.paused ? player.play().catch(() => {}) : player.pause();
      } else if (
        (data.action === 'fullscreenToggle' || data.action === 'fullscreen') &&
        player
      ) {
        player.state.fullscreen
          ? player.exitFullscreen()
          : player.enterFullscreen();
      } else if (data.action === 'fullscreenEnter' && player) {
        player.enterFullscreen();
      } else if (data.action === 'fullscreenExit' && player) {
        player.exitFullscreen();
      } else if (data.action === 'title' && player) {
        player.title = data.title;
      } else if (data.action === 'changeSub' && onChangeSub) {
        onChangeSub(data.index);
      } else if (data.action === 'skipForward' && player) {
        player.currentTime = Math.min(
          player.currentTime + (data.seconds || 10),
          player.duration
        );
      } else if (data.action === 'skipBackward' && player) {
        player.currentTime = Math.max(
          player.currentTime - (data.seconds || 10),
          0
        );
      } else if (data.action === 'mute' && player) {
        player.muted = !player.muted;
      } else if (data.action === 'volumeUp' && player) {
        player.volume = Math.min(player.volume + (data.step || 0.1), 1);
      } else if (data.action === 'volumeDown' && player) {
        player.volume = Math.max(player.volume - (data.step || 0.1), 0);
      } else if (data.action === 'navigationInfo') {
        setNavInfo({ hasNext: !!data.hasNext, hasPrev: !!data.hasPrev });
      } else if (data.action === 'changeVideo' && onChangeVideo && data.url) {
        try {
          const url = new URL(data.url as string);
          const segments = url.pathname.split('/').filter(Boolean);
          const id = segments[segments.length - 1];
          const vid = url.searchParams.get('vid') || undefined;
          if (id) onChangeVideo(id, vid);
        } catch {
          console.error('Invalid changeVideo URL:', data.url);
        }
      } else if (data.action === 'initVideoData' && onInitVideoData) {
        // Desktop app fast path: parent sends pre-fetched video data + skip markers
        // so the player doesn't need to fetch from tau-video.xyz API itself.
        // Cast at the postMessage boundary — data is validated by the main process IPC handler.
        onInitVideoData(data.video as Video, (data.meta as SkipMeta) ?? null);
        // Extract anime title from video data for episode-end overlay
        const video = data.video as Video;
        if (video?.title_name) {
          setAnimeTitle(video.title_name);
        }
      } else if (data.action === 'captions' && player) {
        // Handle captions toggle from parent
        const textTracks = player.textTracks.toArray();
        for (const t of textTracks) {
          if (t.kind === 'subtitles' || t.kind === 'captions') {
            t.mode = data.enabled ? 'showing' : 'disabled';
          }
        }
      } else if (data.action === 'setLiveMode' && liveMode) {
        liveMode.setLiveMode(data.enabled);
        if (data.enabled) {
          postToParent('liveReady');
        }
      } else if (data.action === 'liveSeek' && liveMode) {
        liveMode.liveSeek(data.time);
      } else if (data.action === 'updateViewerCount' && liveMode) {
        liveMode.updateViewerCount(data.count);
      } else if (data.action === 'liveEnd' && liveMode) {
        liveMode.endLiveMode();
      } else if (data.action === 'animeTitle') {
        setAnimeTitle(data.title || null);
      }
    }

    window.addEventListener('message', handleMessage);

    // Ping interval (5s)
    const pingInterval = setInterval(() => {
      try {
        window.parent.postMessage({ action: 'ping' }, TARGET_ORIGIN);
      } catch (e) {
        console.error(e);
      }
    }, 5000);

    // Current time reporting (5s)
    const timeInterval = setInterval(() => {
      const player = playerRef.current;
      window.parent.postMessage(
        {
          action: 'currentTime',
          time: player?.currentTime,
          duration: player?.duration,
          isPlaying: player?.state?.playing || false,
        },
        TARGET_ORIGIN
      );
    }, 5000);

    // Quick time reporting (1s)
    const quickTimeInterval = setInterval(() => {
      const player = playerRef.current;
      window.parent.postMessage(
        {
          action: 'currentTimeQuick',
          time: player?.currentTime,
          duration: player?.duration,
        },
        TARGET_ORIGIN
      );
    }, 1000);

    // Validation timeout (preserved from tau-website, inactive)
    const validationTimeout = setTimeout(() => {
      pingRef.current = true;
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(pingInterval);
      clearInterval(timeInterval);
      clearInterval(quickTimeInterval);
      clearTimeout(validationTimeout);
    };
  }, [playerRef, onChangeSub, onChangeVideo, onInitVideoData, liveMode]);

  return { navInfo, animeTitle };
}
