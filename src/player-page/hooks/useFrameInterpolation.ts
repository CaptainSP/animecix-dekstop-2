import { useCallback, useEffect, useRef, useState } from 'react';
import { createRT, type RT } from 'framegen';

const MODEL_BASE = 'https://cdn.jsdelivr.net/npm/framegen@1.4.0/weights';
const STORAGE_KEY = 'video-frame-interpolation';

interface GPUInfo {
  supported: boolean;
  adapterName: string;
  reason?: string;
}

interface Runtime {
  device: GPUDevice;
  rt: RT;
  outputTex: GPUTexture;
  canvas: HTMLCanvasElement;
  canvasCtx: CanvasRenderingContext2D;
  tw: number;
  th: number;
  cleanup: () => void;
}

async function detectGPU(): Promise<GPUInfo> {
  if (!navigator.gpu) {
    return { supported: false, adapterName: '', reason: 'WebGPU desteklenmiyor' };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, adapterName: '', reason: 'GPU adaptörü bulunamadı' };
    }
    const info = adapter.info;
    const adapterName = info?.device || info?.vendor || 'Bilinmeyen GPU';
    if (!adapter.features.has('shader-f16')) {
      return { supported: false, adapterName, reason: 'shader-f16 desteklenmiyor' };
    }
    return { supported: true, adapterName };
  } catch (err) {
    return { supported: false, adapterName: '', reason: `GPU algılama hatası: ${err}` };
  }
}

async function loadWeights(): Promise<{ bin: ArrayBuffer; manifest: unknown }> {
  const [bin, manifest] = await Promise.all([
    fetch(`${MODEL_BASE}/rt_v7s.bin`).then((r) => r.arrayBuffer()),
    fetch(`${MODEL_BASE}/rt_v7s.json`).then((r) => r.json()),
  ]);
  return { bin, manifest };
}

function captureFrame(
  device: GPUDevice,
  video: HTMLVideoElement,
  w: number,
  h: number,
): GPUTexture {
  const tex = device.createTexture({
    size: [w, h],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.COPY_SRC,
  });
  device.queue.copyExternalImageToTexture(
    { source: video },
    { texture: tex },
    [w, h],
  );
  return tex;
}

/**
 * Reads a GPUTexture back to CPU as ImageData for 2D canvas drawing.
 */
async function textureToImageData(
  device: GPUDevice,
  texture: GPUTexture,
  w: number,
  h: number,
): Promise<ImageData> {
  const bytesPerRow = w * 4;
  const buffer = device.createBuffer({
    size: bytesPerRow * h,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture },
    { buffer, bytesPerRow },
    { width: w, height: h },
  );
  device.queue.submit([encoder.finish()]);

  await buffer.mapAsync(GPUMapMode.READ);
  const data = new Uint8Array(buffer.getMappedRange());
  const copy = new Uint8Array(data);
  buffer.unmap();
  buffer.destroy();

  return new ImageData(new Uint8ClampedArray(copy.buffer), w, h);
}

function startFrameLoop(
  video: HTMLVideoElement,
  device: GPUDevice,
  rt: RT,
  outputTex: GPUTexture,
  canvasCtx: CanvasRenderingContext2D,
  tw: number,
  th: number,
  onFps: (fps: number) => void,
): () => void {
  let running = true;
  let rafId = 0;
  let prevFrame: GPUTexture | null = null;
  let lastVideoTime = -1;
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let pendingRead = false;

  // Clear prevFrame on seek — old frame is meaningless after a jump
  const onSeeking = () => {
    prevFrame?.destroy();
    prevFrame = null;
    lastVideoTime = -1;
  };

  // When paused, draw the current frame directly (no interpolation)
  const drawCurrentFrame = () => {
    if (!running || video.readyState < 2) return;
    const tex = captureFrame(device, video, tw, th);
    textureToImageData(device, tex, tw, th).then((img) => {
      if (running) canvasCtx.putImageData(img, 0, 0);
    });
    tex.destroy();
  };

  const onPause = () => { drawCurrentFrame(); };

  video.addEventListener('seeking', onSeeking);
  video.addEventListener('pause', onPause);

  const tick = async () => {
    if (!running) return;

    if (!pendingRead && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const currentFrame = captureFrame(device, video, tw, th);

      if (prevFrame) {
        pendingRead = true;
        rt.prepPair(prevFrame, currentFrame);
        rt.runT(0.5, outputTex);

        const imageData = await textureToImageData(device, outputTex, tw, th);
        if (running) {
          canvasCtx.putImageData(imageData, 0, 0);
        }
        pendingRead = false;
      } else {
        // First frame after start/seek — just draw it directly
        const imageData = await textureToImageData(device, currentFrame, tw, th);
        if (running) {
          canvasCtx.putImageData(imageData, 0, 0);
        }
      }

      prevFrame?.destroy();
      prevFrame = currentFrame;

      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 2000) {
        onFps(Math.round((frameCount / (now - lastFpsTime)) * 1000));
        frameCount = 0;
        lastFpsTime = now;
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
    video.removeEventListener('seeking', onSeeking);
    video.removeEventListener('pause', onPause);
    try { prevFrame?.destroy(); } catch { /* ignore */ }
  };
}

function stopRuntime(runtime: Runtime | null): void {
  if (!runtime) return;
  try { runtime.cleanup(); } catch { /* ignore */ }
  try { runtime.outputTex.destroy(); } catch { /* ignore */ }
  try { runtime.device.destroy(); } catch { /* ignore */ }
  try { runtime.canvas.remove(); } catch { /* ignore */ }
}

export interface FrameInterpolationState {
  supported: boolean;
  adapterName: string;
  reason?: string;
  active: boolean;
  loading: boolean;
  error: string | null;
  fps: number;
  toggle: () => void;
}

export function useFrameInterpolation(): FrameInterpolationState {
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null);
  const [active, setActive] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const runtimeRef = useRef<Runtime | null>(null);
  const activeRef = useRef(active);

  useEffect(() => { activeRef.current = active; }, [active]);

  // Detect GPU on mount
  useEffect(() => {
    detectGPU().then(setGpuInfo);
  }, []);

  const stop = useCallback(() => {
    stopRuntime(runtimeRef.current);
    runtimeRef.current = null;
    setActive(false);
    setLoading(false);
    setFps(0);
    localStorage.setItem(STORAGE_KEY, 'false');
  }, []);

  const start = useCallback(async () => {
    const video = document.querySelector<HTMLVideoElement>('video');
    const player = document.querySelector<HTMLElement>('[data-media-player]');
    if (!video || !player || !navigator.gpu) return;

    // Wait for video metadata to be loaded
    if (video.readyState < 1 || !video.videoWidth || !video.videoHeight) {
      setError('Video henüz yüklenmedi');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('GPU adaptörü alınamadı');

      const device = await adapter.requestDevice({
        requiredFeatures: adapter.features.has('shader-f16') ? ['shader-f16'] : [],
      });

      const { bin, manifest } = await loadWeights();

      const tw = Math.ceil(video.videoWidth / 16) * 16;
      const th = Math.ceil(video.videoHeight / 16) * 16;

      const rt = await createRT(device, {
        w: tw, h: th,
        weightsBin: bin, weightsManifest: manifest,
        textureInput: true, textureOutput: true,
      });

      const outputTex = device.createTexture({
        size: [tw, th],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.className = 'frame-interp-overlay';
      canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;object-fit:contain;';
      player.style.position = 'relative';
      player.appendChild(canvas);

      const canvasCtx = canvas.getContext('2d');
      if (!canvasCtx) throw new Error('2D canvas context alınamadı');

      const cleanup = startFrameLoop(video, device, rt, outputTex, canvasCtx, tw, th, setFps);
      runtimeRef.current = { device, rt, outputTex, canvas, canvasCtx, tw, th, cleanup };

      setActive(true);
      setLoading(false);
      setFps(0);
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (err) {
      console.error('Frame interpolation init error:', err);
      setError(String(err));
      setLoading(false);
      setActive(false);
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  }, []);

  const toggle = useCallback(() => {
    if (activeRef.current) {
      stop();
    } else if (!loading) {
      start();
    }
  }, [loading, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopRuntime(runtimeRef.current); };
  }, []);

  // Stop framegen when video source changes (episode switch) — dimensions may differ
  useEffect(() => {
    const video = document.querySelector<HTMLVideoElement>('video');
    if (!video) return;

    const onResize = () => {
      const rt = runtimeRef.current;
      if (rt && (video.videoWidth !== rt.tw || video.videoHeight !== rt.th)) {
        stopRuntime(runtimeRef.current);
        runtimeRef.current = null;
        setActive(false);
        setLoading(false);
        localStorage.setItem(STORAGE_KEY, 'false');
      }
    };

    video.addEventListener('resize', onResize);
    return () => { video.removeEventListener('resize', onResize); };
  }, [stop]);

  // Auto-start only on initial page load if localStorage had it enabled.
  // Once the user toggles it off, don't re-enable automatically.
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (!isInitialMountRef.current) return;
    isInitialMountRef.current = false;

    if (!active || !gpuInfo?.supported) return;

    const video = document.querySelector<HTMLVideoElement>('video');
    if (!video) return;

    const tryStart = () => {
      if (video.readyState >= 1 && video.videoWidth > 0) {
        start();
        return true;
      }
      return false;
    };

    if (tryStart()) return;

    video.addEventListener('loadeddata', tryStart, { once: true });
    return () => { video.removeEventListener('loadeddata', tryStart); };
  }, [gpuInfo?.supported]);

  return {
    supported: gpuInfo?.supported ?? false,
    adapterName: gpuInfo?.adapterName ?? '',
    reason: gpuInfo?.reason,
    active,
    loading,
    error,
    fps,
    toggle,
  };
}
