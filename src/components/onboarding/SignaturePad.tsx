"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";

type Props = {
  width?: number;
  height?: number;
  onChange: (svg: string | null) => void;
};

/**
 * Canvas-based signature pad — captures pointer events (touch + mouse +
 * pen) and emits an SVG `<path d="…"/>` document via `onChange` whenever
 * the user lifts their finger / mouse. Empty signature emits `null`.
 *
 * We track all strokes in memory as an array of point arrays so we can
 * (a) re-render on resize, (b) emit clean SVG, and (c) clear on demand.
 */
export function SignaturePad({
  width = 600,
  height = 220,
  onChange,
}: Props) {
  const t = useTranslations("onboarding.signature");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Array<Array<[number, number]>>>([]);
  const currentRef = useRef<Array<[number, number]>>([]);
  const [size, setSize] = useState({ w: width, h: height });

  // Emit cleaned SVG every time strokes change.
  useEffect(() => {
    if (strokes.length === 0) {
      onChange(null);
      return;
    }
    const path = strokes
      .map((s) => {
        const head = s[0];
        if (!head) return "";
        return (
          `M ${head[0].toFixed(1)} ${head[1].toFixed(1)} ` +
          s
            .slice(1)
            .map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`)
            .join(" ")
        );
      })
      .filter(Boolean)
      .join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.w} ${size.h}" width="${size.w}" height="${size.h}"><path d="${path}" fill="none" stroke="black" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    onChange(svg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  // Re-render canvas pixel data whenever strokes or size change.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
    ctx.clearRect(0, 0, size.w, size.h);
    for (const s of strokes) {
      const head = s[0];
      if (!head || s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(head[0], head[1]);
      for (const [x, y] of s.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, [strokes, size]);

  // Auto-fit width to container on mount + resize.
  useEffect(() => {
    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const w = Math.max(280, Math.floor(el.clientWidth));
      setSize((s) => (s.w === w ? s : { w, h: s.h }));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  function pointFor(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    currentRef.current = [pointFor(e)];
    setDrawing(true);
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing) return;
      currentRef.current.push(pointFor(e));
      // Live-draw the in-progress stroke for snappy feedback.
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const pts = currentRef.current;
      if (pts.length < 2) return;
      const prev = pts[pts.length - 2];
      const curr = pts[pts.length - 1];
      if (!prev || !curr) return;
      ctx.beginPath();
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(curr[0], curr[1]);
      ctx.stroke();
    },
    [drawing],
  );

  const onUp = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    const stroke = currentRef.current;
    currentRef.current = [];
    if (stroke.length < 2) return;
    setStrokes((arr) => [...arr, stroke]);
  }, [drawing]);

  function clear() {
    setStrokes([]);
    currentRef.current = [];
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <div
        className={cn(
          "relative overflow-hidden rounded-md border-2 border-neutral-200 bg-white",
        )}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          className="block touch-none"
        />
        {strokes.length === 0 && !drawing && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grid place-items-center text-[14px] text-neutral-400"
          >
            {t("placeholder")}
          </div>
        )}
        {/* baseline line for guidance */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-8 left-6 right-6 border-t border-dashed border-neutral-200"
        />
      </div>
      <div className="flex items-center justify-between text-[12px] text-neutral-500">
        <span>{t("hint")}</span>
        <button
          type="button"
          onClick={clear}
          disabled={strokes.length === 0}
          className={cn(
            "rounded-md border border-neutral-200 bg-white px-3 py-1 font-medium transition",
            strokes.length === 0
              ? "opacity-50"
              : "hover:border-error-500 hover:text-error-700",
          )}
        >
          {t("clear")}
        </button>
      </div>
    </div>
  );
}
