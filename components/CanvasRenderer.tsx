"use client";

import { useEffect, useRef } from 'react';

export type TextElement = {
  id: string;
  kind: 'text';
  text: string;
  x: number; // 0..1
  y: number; // 0..1
  fontSize: number; // px relative to height, e.g., 48
  color: string;
  align: CanvasTextAlign;
};

export type ImageElement = {
  id: string;
  kind: 'image';
  src: string; // data URL
  x: number; // center 0..1
  y: number; // center 0..1
  width: number; // fraction of canvas width 0..1
};

export type Slide = {
  id: string;
  durationSec: number;
  background: string;
  elements: Array<TextElement | ImageElement>;
};

export type Timeline = Slide[];

export type CanvasRendererProps = {
  width: number;
  height: number;
  timeline: Timeline;
  isPlaying: boolean;
  currentTimeMs: number;
  onDurationResolve?: (totalMs: number) => void;
};

export default function CanvasRenderer({ width, height, timeline, isPlaying, currentTimeMs, onDurationResolve }: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    if (!timeline.length) return;
    const totalMs = Math.round(timeline.reduce((acc, s) => acc + s.durationSec * 1000, 0));
    onDurationResolve?.(totalMs);
  }, [timeline, onDurationResolve]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tMs = Math.max(0, currentTimeMs);
    let acc = 0;
    let slide: Slide | null = null;
    let localT = 0;
    for (const s of timeline) {
      const sMs = s.durationSec * 1000;
      if (tMs < acc + sMs) {
        slide = s;
        localT = (tMs - acc) / sMs; // 0..1
        break;
      }
      acc += sMs;
    }

    ctx.clearRect(0, 0, width, height);
    if (!slide) return;

    // background
    ctx.fillStyle = slide.background || '#000';
    ctx.fillRect(0, 0, width, height);

    // simple fade-in for first 10% of slide
    const fade = Math.min(1, localT / 0.1);

    for (const el of slide.elements) {
      if (el.kind === 'text') {
        ctx.globalAlpha = fade;
        const fontPx = Math.round(el.fontSize);
        ctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
        ctx.fillStyle = el.color;
        ctx.textAlign = el.align;
        ctx.textBaseline = 'middle';
        const x = Math.round(el.x * width);
        const y = Math.round(el.y * height);
        wrapFillText(ctx, el.text, x, y, Math.round(width * 0.9), fontPx * 1.3);
        ctx.globalAlpha = 1;
      } else if (el.kind === 'image') {
        ctx.globalAlpha = fade;
        let img = imagesRef.current.get(el.id);
        if (!img) {
          img = new Image();
          img.src = el.src;
          imagesRef.current.set(el.id, img);
        }
        const maxW = Math.round(el.width * width);
        const scale = img.naturalWidth ? Math.min(1, maxW / img.naturalWidth) : 1;
        const drawW = Math.round((img.naturalWidth || maxW) * scale);
        const drawH = Math.round((img.naturalHeight || maxW) * scale);
        const cx = Math.round(el.x * width);
        const cy = Math.round(el.y * height);
        ctx.drawImage(img, cx - Math.round(drawW / 2), cy - Math.round(drawH / 2), drawW, drawH);
        ctx.globalAlpha = 1;
      }
    }
  }, [timeline, currentTimeMs, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: '100%', display: 'block' }} />;
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
