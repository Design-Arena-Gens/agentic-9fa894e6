"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../app/page.module.css';
import CanvasRenderer, { Slide, TextElement, ImageElement } from './CanvasRenderer';

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const FPS = 30;

function uid() { return Math.random().toString(36).slice(2, 9); }

export default function VideoCreator() {
  const [slides, setSlides] = useState<Slide[]>([{
    id: uid(),
    durationSec: 3,
    background: '#0b1021',
    elements: [
      { id: uid(), kind: 'text', text: 'Your title here', x: 0.5, y: 0.5, fontSize: 64, color: '#ffffff', align: 'center' }
    ],
  }]);

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [totalMs, setTotalMs] = useState(3000);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const playerTimerRef = useRef<number | null>(null);

  // Playback
  useEffect(() => {
    if (!isPlaying) {
      if (playerTimerRef.current) cancelAnimationFrame(playerTimerRef.current);
      playerTimerRef.current = null;
      return;
    }
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start == null) start = ts - (currentTimeMs % totalMs);
      const t = ts - start;
      const next = t % totalMs;
      setCurrentTimeMs(next);
      playerTimerRef.current = requestAnimationFrame(tick);
    };
    playerTimerRef.current = requestAnimationFrame(tick);
    return () => { if (playerTimerRef.current) cancelAnimationFrame(playerTimerRef.current); };
  }, [isPlaying, totalMs]);

  const addSlide = () => {
    setSlides(prev => [...prev, {
      id: uid(),
      durationSec: 3,
      background: '#111827',
      elements: [
        { id: uid(), kind: 'text', text: 'New slide', x: 0.5, y: 0.5, fontSize: 56, color: '#ffffff', align: 'center' }
      ],
    }]);
  };

  const removeSlide = (id: string) => {
    setSlides(prev => prev.filter(s => s.id !== id));
  };

  const duplicateSlide = (id: string) => {
    setSlides(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      const copy: Slide = JSON.parse(JSON.stringify(prev[idx]));
      copy.id = uid();
      copy.elements = copy.elements.map(e => ({ ...e, id: uid() })) as any;
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };

  const addText = (slideId: string) => {
    setSlides(prev => prev.map(s => s.id === slideId ? {
      ...s,
      elements: [...s.elements, { id: uid(), kind: 'text', text: 'Text', x: 0.5, y: 0.5, fontSize: 48, color: '#ffffff', align: 'center' } as TextElement]
    } : s));
  };

  const addImage = (slideId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      setSlides(prev => prev.map(s => s.id === slideId ? {
        ...s,
        elements: [...s.elements, { id: uid(), kind: 'image', src, x: 0.5, y: 0.5, width: 0.6 } as ImageElement]
      } : s));
    };
    reader.readAsDataURL(file);
  };

  const updateSlide = (id: string, patch: Partial<Slide>) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const updateElement = (slideId: string, elId: string, patch: any) => {
    setSlides(prev => prev.map(s => s.id === slideId ? {
      ...s,
      elements: s.elements.map(el => el.id === elId ? { ...el, ...patch } as any : el)
    } : s));
  };

  // Recording to WebM
  const record = useCallback(async () => {
    setDownloadUrl(url => { if (url) URL.revokeObjectURL(url); return null; });
    setIsRecording(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D context');

      const chunks: BlobPart[] = [];
      const stream = (canvas as HTMLCanvasElement).captureStream(FPS);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

      let tMs = 0;
      const total = Math.round(slides.reduce((a, s) => a + s.durationSec * 1000, 0));
      let acc = 0;

      rec.start();

      const images = new Map<string, HTMLImageElement>();
      const getImg = (el: ImageElement) => {
        let im = images.get(el.id);
        if (!im) { im = new Image(); im.src = el.src; images.set(el.id, im); }
        return im;
      };

      const drawFrame = () => {
        // determine slide
        let remaining = tMs;
        let slide: Slide | null = null;
        for (const s of slides) {
          const sMs = s.durationSec * 1000;
          if (remaining < sMs) { slide = s; break; }
          remaining -= sMs;
        }
        if (!slide) slide = slides[slides.length - 1];

        // background
        ctx.fillStyle = slide.background || '#000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const localT = remaining / (slide.durationSec * 1000);
        const fade = Math.min(1, localT / 0.1);

        for (const el of slide.elements) {
          if (el.kind === 'text') {
            ctx.globalAlpha = fade;
            const fontPx = Math.round(el.fontSize);
            ctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
            ctx.fillStyle = el.color;
            ctx.textAlign = el.align;
            ctx.textBaseline = 'middle';
            const x = Math.round(el.x * CANVAS_WIDTH);
            const y = Math.round(el.y * CANVAS_HEIGHT);
            wrapFillText(ctx, el.text, x, y, Math.round(CANVAS_WIDTH * 0.9), fontPx * 1.3);
            ctx.globalAlpha = 1;
          } else {
            ctx.globalAlpha = fade;
            const img = getImg(el);
            const maxW = Math.round(el.width * CANVAS_WIDTH);
            const scale = img.naturalWidth ? Math.min(1, maxW / img.naturalWidth) : 1;
            const drawW = Math.round((img.naturalWidth || maxW) * scale);
            const drawH = Math.round((img.naturalHeight || maxW) * scale);
            const cx = Math.round(el.x * CANVAS_WIDTH);
            const cy = Math.round(el.y * CANVAS_HEIGHT);
            ctx.drawImage(img, cx - Math.round(drawW / 2), cy - Math.round(drawH / 2), drawW, drawH);
            ctx.globalAlpha = 1;
          }
        }
      };

      const frameIntervalMs = 1000 / FPS;
      const totalFrames = Math.ceil(total / frameIntervalMs);
      for (let i = 0; i < totalFrames; i++) {
        drawFrame();
        // advance time and force frame
        tMs = Math.min(total, Math.round((i + 1) * frameIntervalMs));
        await nextAnimationFrame();
      }

      rec.stop();
      await once(rec, 'stop');

      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (e) {
      console.error(e);
      alert('Recording failed. Please try a simpler video.');
    } finally {
      setIsRecording(false);
    }
  }, [slides]);

  const currentSlideIndex = useMemo(() => {
    let acc = 0;
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const sMs = s.durationSec * 1000;
      if (currentTimeMs < acc + sMs) return i;
      acc += sMs;
    }
    return slides.length - 1;
  }, [slides, currentTimeMs]);

  return (
    <div className={styles.grid}>
      <div className={styles.panel}>
        <div className={styles.canvasWrap}>
          <CanvasRenderer
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            timeline={slides}
            isPlaying={isPlaying}
            currentTimeMs={currentTimeMs}
            onDurationResolve={setTotalMs}
          />
        </div>
        <div className={styles.tools} style={{ marginTop: 12 }}>
          <button className={styles.btn} onClick={() => setIsPlaying(p => !p)}>{isPlaying ? 'Pause' : 'Play'}</button>
          <button className={styles.btn + ' ' + 'secondary'} onClick={() => setCurrentTimeMs(0)}>Reset</button>
          <div className={styles.badge}>{formatMs(currentTimeMs)} / {formatMs(totalMs)}</div>
          <div className={styles.download} />
          <button className={styles.btn} disabled={isRecording} onClick={record}>{isRecording ? 'Rendering?' : 'Export WebM'}</button>
          {downloadUrl && (
            <a className={styles.btn + ' ' + 'secondary'} href={downloadUrl} download="video.webm">Download</a>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.sectionTitle}>Slides</div>
        <div className={styles.list}>
          {slides.map((s, i) => (
            <div key={s.id} className={styles.row} style={{ justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700 }}>Slide {i + 1} {i === currentSlideIndex ? <span className={styles.badge}>current</span> : null}</div>
                <div className={styles.small}>Duration</div>
                <input className={styles.input} type="number" min={1} max={30} step={1} value={s.durationSec}
                  onChange={e => updateSlide(s.id, { durationSec: clamp(Number(e.target.value) || 1, 1, 60) })} />
                <div className={styles.small} style={{ marginTop: 4 }}>Background</div>
                <input className={styles.input} type="color" value={s.background}
                  onChange={e => updateSlide(s.id, { background: e.target.value })} />
              </div>
              <div className={styles.row}>
                <button className={styles.btn + ' ' + 'secondary'} onClick={() => duplicateSlide(s.id)}>Duplicate</button>
                <button className={styles.btn + ' ' + 'danger'} onClick={() => removeSlide(s.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.row} style={{ marginTop: 8 }}>
          <button className={styles.btn} onClick={addSlide}>Add slide</button>
        </div>

        <hr className={styles.hr} />
        <div className={styles.sectionTitle}>Elements</div>
        <div className={styles.list}>
          {slides[currentSlideIndex]?.elements.map((el) => (
            <div key={el.id} className={styles.row} style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div className={styles.badge}>{el.kind}</div>
                {el.kind === 'text' ? (
                  <div>
                    <div className={styles.small}>Text</div>
                    <input className={styles.input} style={{ width: 240 }} value={el.text}
                      onChange={e => updateElement(slides[currentSlideIndex].id, el.id, { text: e.target.value })} />
                    <div className={styles.small} style={{ marginTop: 4 }}>Font size</div>
                    <input className={styles.input} type="number" min={12} max={120} value={(el as TextElement).fontSize}
                      onChange={e => updateElement(slides[currentSlideIndex].id, el.id, { fontSize: clamp(Number(e.target.value) || 12, 12, 160) })} />
                    <div className={styles.small} style={{ marginTop: 4 }}>Color</div>
                    <input className={styles.input} type="color" value={(el as TextElement).color}
                      onChange={e => updateElement(slides[currentSlideIndex].id, el.id, { color: e.target.value })} />
                    <div className={styles.small} style={{ marginTop: 4 }}>Align</div>
                    <select className={styles.input} value={(el as TextElement).align}
                      onChange={e => updateElement(slides[currentSlideIndex].id, el.id, { align: e.target.value as CanvasTextAlign })}>
                      <option value="left">left</option>
                      <option value="center">center</option>
                      <option value="right">right</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <div className={styles.small}>Width</div>
                    <input className={styles.input} type="range" min={0.1} max={1} step={0.05} value={(el as ImageElement).width}
                      onChange={e => updateElement(slides[currentSlideIndex].id, el.id, { width: Number(e.target.value) })} />
                  </div>
                )}
                <div className={styles.small} style={{ marginTop: 4 }}>Position X / Y</div>
                <div className={styles.row}>
                  <input className={styles.input} type="range" min={0} max={1} step={0.01} value={el.x}
                    onChange={e => updateElement(slides[currentSlideIndex].id, el.id, { x: Number(e.target.value) })} />
                  <input className={styles.input} type="range" min={0} max={1} step={0.01} value={el.y}
                    onChange={e => updateElement(slides[currentSlideIndex].id, el.id, { y: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                {el.kind === 'image' ? null : (
                  <div className={styles.row}>
                    <button className={styles.btn + ' ' + 'secondary'} onClick={() => updateElement(slides[currentSlideIndex].id, el.id, { x: 0.5, y: 0.5 })}>Center</button>
                  </div>
                )}
                <div className={styles.row} style={{ marginTop: 8 }}>
                  <button className={styles.btn + ' ' + 'danger'} onClick={() => updateElement(slides[currentSlideIndex].id, el.id, { delete: true })}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.row} style={{ marginTop: 8 }}>
          <button className={styles.btn} onClick={() => addText(slides[currentSlideIndex].id)}>Add text</button>
          <label className={styles.btn + ' ' + 'secondary'}>
            Upload image
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
              const file = e.target.files?.[0];
              if (file) addImage(slides[currentSlideIndex].id, file);
              e.currentTarget.value = '';
            }} />
          </label>
        </div>

      </div>
    </div>
  );
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${String(rs).padStart(2, '0')}`;
}

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

function once(target: EventTarget, event: string) {
  return new Promise<void>((resolve) => {
    const handler = () => { target.removeEventListener(event, handler as any); resolve(); };
    target.addEventListener(event, handler as any);
  });
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function wrapFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const testLine = line ? line + ' ' + w : w;
    const { width } = ctx.measureText(testLine);
    if (width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}
