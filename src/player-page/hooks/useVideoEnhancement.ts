import { useCallback, useEffect, useRef, useState } from 'react';
import type { Anime4KPipeline } from 'anime4k-webgpu';

export type UpscalePreset = 'off' | 'light' | 'balanced' | 'maximum';

export interface ColorFilters {
  brightness: number;
  contrast: number;
  saturate: number;
}

export interface EnhancementStats {
  fps: number;
  outputLabel: string;
  performance: 'excellent' | 'good' | 'poor' | null;
}

const DEFAULT_FILTERS: ColorFilters = { brightness: 1, contrast: 1, saturate: 1 };
const STORAGE_KEY = 'video-enhancement-preset';
const FILTERS_KEY = 'video-enhancement-filters';
const supportsWebGpuCanvas = navigator.platform.toLowerCase().startsWith('win');

const QUAD_WGSL = `
struct VO { @builtin(position) pos: vec4f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  var o: VO; o.pos = vec4f(p[i],0,1); return o;
}
@group(0) @binding(0) var t: texture_2d<f32>;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let dim = textureDimensions(t);
  let xy = clamp(vec2i(pos.xy), vec2i(0), vec2i(dim) - vec2i(1));
  return clamp(textureLoad(t, xy, 0), vec4f(0), vec4f(1));
}`;

interface Session {
  device: GPUDevice;
  running: boolean;
  videoWidth: number;
  videoHeight: number;
}

function loadPreset(): UpscalePreset {
  if (!supportsWebGpuCanvas) return 'off';
  return (localStorage.getItem(STORAGE_KEY) as UpscalePreset) || 'off';
}

function loadFilters(): ColorFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_FILTERS };
}

function getFilterStyle(filters: ColorFilters): string {
  const parts: string[] = [];
  if (filters.brightness !== 1) parts.push(`brightness(${filters.brightness})`);
  if (filters.contrast !== 1) parts.push(`contrast(${filters.contrast})`);
  if (filters.saturate !== 1) parts.push(`saturate(${filters.saturate})`);
  return parts.join(' ');
}

function getPresetFallbackStyle(preset: UpscalePreset): string {
  if (preset === 'light') return 'contrast(1.04) saturate(1.04)';
  if (preset === 'balanced') return 'contrast(1.07) saturate(1.08)';
  if (preset === 'maximum') return 'contrast(1.1) saturate(1.12)';
  return '';
}

function joinFilters(...styles: string[]): string {
  return styles.filter(Boolean).join(' ');
}

function applyFilters(
  container: HTMLElement | null,
  filters: ColorFilters,
  preset: UpscalePreset,
  hasOutput: boolean,
): void {
  const filterStyle = getFilterStyle(filters);
  const video = document.querySelector('video') as HTMLVideoElement | null;
  if (video) {
    video.style.filter = joinFilters(filterStyle, hasOutput ? '' : getPresetFallbackStyle(preset));
  }

  const canvas = container?.querySelector('canvas');
  if (canvas instanceof HTMLCanvasElement) {
    canvas.style.filter = filterStyle;
  }
}

export function useVideoEnhancement(containerRef: React.RefObject<HTMLElement | null>) {
  const [preset, setPresetState] = useState<UpscalePreset>(loadPreset);
  const [filters, setFiltersState] = useState<ColorFilters>(loadFilters);
  const [stats, setStats] = useState<EnhancementStats>({ fps: 0, outputLabel: '', performance: null });
  const [panelOpen, setPanelOpen] = useState(false);
  const [hasOutput, setHasOutput] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const presetRef = useRef<UpscalePreset>(loadPreset());
  const filtersRef = useRef<ColorFilters>(loadFilters());
  const hasOutputRef = useRef(false);

  const isActive = preset !== 'off';

  const destroySession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.running = false;
      sessionRef.current.device.destroy();
      sessionRef.current = null;
    }
    const container = containerRef.current;
    if (container) container.innerHTML = '';
    setStats({ fps: 0, outputLabel: '', performance: null });
    hasOutputRef.current = false;
    setHasOutput(false);
  }, [containerRef]);

  const startRendering = useCallback(async (selectedPreset: UpscalePreset) => {
    const container = containerRef.current;
    if (!supportsWebGpuCanvas) {
      destroySession();
      return;
    }
    if (!container || selectedPreset === 'off' || !navigator.gpu) return;

    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video || video.readyState < 2) return;

    destroySession();
    hasOutputRef.current = false;
    setHasOutput(false);

    const nativeW = video.videoWidth;
    const nativeH = video.videoHeight;
    if (!nativeW || !nativeH) return;

    const canvasW = nativeW * 2;
    const canvasH = nativeH * 2;
    const outputLabel = canvasH >= 2160 ? '4K' : canvasH >= 1440 ? '2K' : `${canvasH}p`;

    const canvas = document.createElement('canvas');
    canvas.className = 'enhancement-canvas';
    canvas.width = canvasW;
    canvas.height = canvasH;
    container.appendChild(canvas);
    applyFilters(container, filtersRef.current, selectedPreset, hasOutputRef.current);

    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return;
      const device = await adapter.requestDevice();

      const session: Session = { device, running: true, videoWidth: nativeW, videoHeight: nativeH };
      sessionRef.current = session;

      const format = navigator.gpu.getPreferredCanvasFormat();
      const ctx = canvas.getContext('webgpu')!;
      ctx.configure({ device, format, alphaMode: 'premultiplied' });

      const inputTexture = device.createTexture({
        size: [nativeW, nativeH],
        format: 'rgba16float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      const anime4k = await import('anime4k-webgpu');
      const pipelines = buildPipelines(anime4k, device, inputTexture, selectedPreset);

      const renderBindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        ],
      });
      const module = device.createShaderModule({ code: QUAD_WGSL });
      const renderPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [renderBindGroupLayout] }),
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      });
      const lastOutput = pipelines[pipelines.length - 1].getOutputTexture();
      const bindGroup = device.createBindGroup({
        layout: renderBindGroupLayout,
        entries: [
          { binding: 0, resource: lastOutput.createView() },
        ],
      });

      let frameCount = 0;
      let fpsTime = performance.now();
      let lastMediaTime = -1;
      let outputStarted = false;

      const loop: VideoFrameRequestCallback = (_now, metadata) => {
        if (!session.running) return;

        // Detect video source change (seamless episode transition) — restart pipeline
        if (video.videoWidth !== session.videoWidth || video.videoHeight !== session.videoHeight) {
          session.running = false;
          startRendering(presetRef.current);
          return;
        }

        if (metadata.mediaTime === lastMediaTime) {
          video.requestVideoFrameCallback(loop);
          return;
        }
        lastMediaTime = metadata.mediaTime;

        try {
          device.queue.copyExternalImageToTexture(
            { source: video },
            { texture: inputTexture },
            [nativeW, nativeH],
          );

          const encoder = device.createCommandEncoder();
          for (const p of pipelines) p.pass(encoder);

          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: ctx.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            }],
          });
          pass.setPipeline(renderPipeline);
          pass.setBindGroup(0, bindGroup);
          pass.draw(6);
          pass.end();
          device.queue.submit([encoder.finish()]);

          if (!outputStarted) {
            outputStarted = true;
            hasOutputRef.current = true;
            applyFilters(container, filtersRef.current, presetRef.current, true);
            setHasOutput(true);
          }

          frameCount++;
          const elapsed = performance.now() - fpsTime;
          if (elapsed >= 3000) {
            const fps = Math.round((frameCount / elapsed) * 1000);
            const perf: EnhancementStats['performance'] = fps >= 20 ? 'excellent' : fps >= 14 ? 'good' : 'poor';
            setStats({ fps, outputLabel, performance: perf });
            frameCount = 0;
            fpsTime = performance.now();
          }
        } catch {
          session.running = false;
          return;
        }

        video.requestVideoFrameCallback(loop);
      };

      video.requestVideoFrameCallback(loop);
    } catch (e) {
      console.error('Enhancement error:', e);
      destroySession();
    }
  }, [containerRef, destroySession]);

  // Restart on fullscreen change — canvas/context can become stale
  useEffect(() => {
    if (!isActive) return;
    const handler = () => {
      if (sessionRef.current?.running) {
        setTimeout(() => startRendering(presetRef.current), 300);
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [isActive, startRendering]);

  // Restart when video resumes after pause — re-kick the loop
  useEffect(() => {
    if (!isActive) return;
    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video) return;

    const onPlay = () => {
      const session = sessionRef.current;
      if (session && !session.running) {
        startRendering(presetRef.current);
      }
    };

    // Restart after seamless episode change (new video source loaded)
    const onCanPlay = () => {
      if (sessionRef.current) {
        startRendering(presetRef.current);
      }
    };

    // Restart on quality/source change — video dimensions change
    const onResize = () => {
      const session = sessionRef.current;
      if (session && (video.videoWidth !== session.videoWidth || video.videoHeight !== session.videoHeight)) {
        startRendering(presetRef.current);
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('loadeddata', onCanPlay);
    video.addEventListener('resize', onResize);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('loadeddata', onCanPlay);
      video.removeEventListener('resize', onResize);
    };
  }, [isActive, startRendering]);

  // Auto-start when video is ready
  useEffect(() => {
    if (!isActive) { destroySession(); return; }

    const tryStart = () => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (video && video.readyState >= 2) { startRendering(preset); return true; }
      return false;
    };
    if (tryStart()) return;

    const observer = new MutationObserver(() => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (video) {
        video.addEventListener('canplay', () => tryStart(), { once: true });
        if (video.readyState >= 2) tryStart();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); destroySession(); };
  }, [preset, isActive, startRendering, destroySession]);

  useEffect(() => {
    if (!supportsWebGpuCanvas) {
      destroySession();
      localStorage.setItem(STORAGE_KEY, 'off');
      setPresetState('off');
      presetRef.current = 'off';
      applyFilters(containerRef.current, filters, 'off', false);
      return;
    }
    applyFilters(containerRef.current, filters, preset, hasOutput);
  }, [containerRef, destroySession, filters, hasOutput, preset]);

  const setPreset = useCallback((newPreset: UpscalePreset) => {
    if (!supportsWebGpuCanvas) {
      destroySession();
      setPresetState('off');
      presetRef.current = 'off';
      localStorage.setItem(STORAGE_KEY, 'off');
      applyFilters(containerRef.current, filtersRef.current, 'off', false);
      return;
    }

    setPresetState(newPreset);
    presetRef.current = newPreset;
    hasOutputRef.current = false;
    setHasOutput(false);
    localStorage.setItem(STORAGE_KEY, newPreset);
    applyFilters(containerRef.current, filtersRef.current, newPreset, false);
  }, [containerRef]);

  const setFilters = useCallback((newFilters: Partial<ColorFilters>) => {
    setFiltersState(prev => {
      const updated = { ...prev, ...newFilters };
      filtersRef.current = updated;
      localStorage.setItem(FILTERS_KEY, JSON.stringify(updated));
      applyFilters(containerRef.current, updated, presetRef.current, hasOutputRef.current);
      return updated;
    });
  }, [containerRef]);

  return {
    preset, setPreset, filters, setFilters,
    isActive: supportsWebGpuCanvas && isActive,
    hasOutput: supportsWebGpuCanvas && hasOutput,
    stats,
    panelOpen,
    setPanelOpen,
  };
}

function buildPipelines(
  anime4k: typeof import('anime4k-webgpu'),
  device: GPUDevice,
  inputTexture: GPUTexture,
  preset: UpscalePreset,
): Anime4KPipeline[] {
  if (preset === 'light') {
    return [new anime4k.ModeA({
      device,
      inputTexture,
      nativeDimensions: { width: inputTexture.width, height: inputTexture.height },
      targetDimensions: { width: inputTexture.width * 2, height: inputTexture.height * 2 },
    })];
  }

  if (preset === 'balanced') {
    return [new anime4k.ModeB({
      device,
      inputTexture,
      nativeDimensions: { width: inputTexture.width, height: inputTexture.height },
      targetDimensions: { width: inputTexture.width * 2, height: inputTexture.height * 2 },
    })];
  }

  return [new anime4k.ModeC({
    device,
    inputTexture,
    nativeDimensions: { width: inputTexture.width, height: inputTexture.height },
    targetDimensions: { width: inputTexture.width * 2, height: inputTexture.height * 2 },
  })];
}
