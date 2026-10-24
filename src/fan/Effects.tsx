import React, { useEffect, useRef, useState } from "react";
import { FX } from "./config";
import { useFan } from "./store";
import { useReducedMotion } from "./useMotion";
import { playSound } from "./sound";
export function OriginalSpider({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 48"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="20" cy="29" rx="5" ry="8" fill="currentColor" />
      <circle cx="20" cy="17" r="4" fill="currentColor" />
      <path
        d="M16 20 8 12 6 3M24 20l8-8 2-9M15 24 4 19 1 10M25 24l11-5 3-9M15 28 5 31 2 41M25 28l10 3 3 10M17 33l-7 7-1 7M23 33l7 7 1 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function FanLoader() {
  const reduced = useReducedMotion(),
    effects = useFan((s) => s.effects);
  const [progress, setProgress] = useState(
    reduced || effects === "off" ? 100 : 0,
  );
  const [done, setDone] = useState(reduced || effects === "off");
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (done) return;
    let id = 0,
      start = performance.now();
    function frame(t: number) {
      const value = Math.min(100, ((t - start) / FX.loaderMs) * 100);
      setProgress(Math.round(value));
      if (value < 100) id = requestAnimationFrame(frame);
      else setExiting(true);
    }
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [done]);
  if (done) return null;
  return (
    <div
      className={`fan-loader ${exiting ? "is-exiting" : ""}`}
      style={{ animationDuration: `${FX.wipeMs}ms` }}
      onAnimationEnd={() => setDone(true)}
    >
      <button onClick={() => setDone(true)}>Skip intro ↗</button>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <path
            key={i}
            d={`M120 120 L${120 + 110 * Math.cos((i * Math.PI) / 6)} ${120 + 110 * Math.sin((i * Math.PI) / 6)}`}
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - Math.min(100, progress * 2)}
          />
        ))}
        {
          <path
            d={Array.from({ length: FX.loaderSpiralSteps + 1 }, (_, i) => {
              const f = i / FX.loaderSpiralSteps,
                a = f * Math.PI * 2 * FX.loaderSpiralTurns;
              return `${i ? "L" : "M"}${120 + Math.cos(a) * f * 110} ${120 + Math.sin(a) * f * 110}`;
            }).join(" ")}
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - Math.max(0, ((progress - 40) / 60) * 100)}
          />
        }
      </svg>
      <p aria-live="off">
        SPINNING THE CITY{" "}
        <strong>{progress.toString().padStart(3, "0")}%</strong>
      </p>
    </div>
  );
}
export function ClickEffects() {
  const canvas = useRef<HTMLCanvasElement>(null),
    effects = useFan((s) => s.effects),
    theme = useFan((s) => s.theme),
    reduced = useReducedMotion();
  useEffect(() => {
    if (effects === "off" || reduced) return;
    const el = canvas.current!,
      ctx = el.getContext("2d")!;
    let w = innerWidth,
      h = innerHeight,
      raf = 0,
      corner = 0,
      last = performance.now(),
      pointer = { x: -100, y: -100 },
      trail: { x: number; y: number }[] = [],
      shots: { x: number; y: number; t: number; side: number }[] = [],
      interactive = false;
    const coarse = matchMedia("(pointer:coarse)").matches;
    const resize = () => {
      w = innerWidth;
      h = innerHeight;
      const dpr = Math.min(devicePixelRatio, FX.dpr);
      el.width = w * dpr;
      el.height = h * dpr;
      el.style.width = w + "px";
      el.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const click = (e: PointerEvent) => {
      shots.push({
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        side: corner++ % 2,
      });
      shots = shots.slice(-FX.maxShots);
      playSound("thwip", useFan.getState().sound);
      start();
    };
    const move = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      interactive = !!(e.target as Element).closest(
        "button,a,input,summary,[tabindex]",
      );
      if (effects === "full" && !coarse) {
        trail.push({ ...pointer });
        trail = trail.slice(-FX.cursor.tail);
      }
      start();
    };
    function start() {
      if (!raf && !document.hidden) raf = requestAnimationFrame(draw);
    }
    function draw(t: number) {
      raf = 0;
      ctx.clearRect(0, 0, w, h);
      shots = shots.filter((s) => t - s.t < FX.shotMs + FX.holdMs + FX.fadeMs);
      for (const s of shots) {
        const elapsed = t - s.t,
          p = Math.min(1, elapsed / FX.shotMs),
          fade = Math.max(0, 1 - (elapsed - FX.shotMs - FX.holdMs) / FX.fadeMs),
          sx = s.side ? w : 0;
        ctx.globalAlpha = fade;
        ctx.strokeStyle = FX.colors[theme].cyan;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(sx, h);
        ctx.quadraticCurveTo(
          (sx + s.x) / 2,
          h - (h - s.y) * 0.25,
          sx + (s.x - sx) * p,
          h + (s.y - h) * p,
        );
        ctx.stroke();
        if (p === 1) {
          for (let i = 0; i < FX.splatStrands; i++) {
            const a = (i * Math.PI * 2) / FX.splatStrands;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(
              s.x + Math.cos(a) * FX.splatRadius,
              s.y + Math.sin(a) * FX.splatRadius,
            );
            ctx.stroke();
          }
          for (let ring = 1; ring <= FX.splatRings; ring++) {
            ctx.beginPath();
            for (let i = 0; i <= FX.splatStrands; i++) {
              const a = (i * Math.PI * 2) / FX.splatStrands,
                r =
                  ((FX.splatRadius * ring) / FX.splatRings) *
                  (1 + 0.08 * Math.sin(i * 4));
              const x = s.x + Math.cos(a) * r,
                y = s.y + Math.sin(a) * r;
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      if (!coarse && effects === "full" && performance.now() - last < 2000) {
        ctx.strokeStyle = FX.colors[theme].cyan;
        for (let i = 0; i < trail.length; i++) {
          const follow = i ? trail[i - 1] : pointer;
          trail[i].x += (follow.x - trail[i].x) * FX.cursor.ease;
          trail[i].y += (follow.y - trail[i].y) * FX.cursor.ease;
        }
        for (let i = 1; i < trail.length; i++) {
          ctx.lineWidth = (FX.cursor.width * i) / trail.length;
          ctx.globalAlpha = (i / trail.length) * 0.6;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.8;
        ctx.save();
        ctx.translate(pointer.x, pointer.y);
        ctx.rotate(t * 0.0003);
        const r = interactive ? 17 : 10;
        ctx.lineWidth = 1;
        ctx.strokeRect(-r, -r, r * 2, r * 2);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (shots.length || (!coarse && effects === "full" && t - last < 1800))
        raf = requestAnimationFrame(draw);
    }
    const track = (e: PointerEvent) => {
      last = performance.now();
      move(e);
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else start();
    };
    window.addEventListener("resize", resize);
    window.addEventListener("pointerdown", click);
    window.addEventListener("pointermove", track);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", click);
      window.removeEventListener("pointermove", track);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [effects, theme, reduced]);
  return (
    <canvas ref={canvas} className="fan-click-canvas" aria-hidden="true" />
  );
}
export function HeroWeb() {
  const ref = useRef<HTMLCanvasElement>(null),
    theme = useFan((s) => s.theme),
    effects = useFan((s) => s.effects),
    reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current!,
      ctx = el.getContext("2d")!;
    let w = 0,
      h = 0,
      id = 0,
      visible = true;
    const full = effects === "full",
      radials = full ? FX.hero.radials : FX.hero.liteRadials,
      rings = full ? FX.hero.rings : FX.hero.liteRings;
    let nodes: {
        x: number;
        y: number;
        px: number;
        py: number;
        ox: number;
        oy: number;
        pin: boolean;
      }[] = [],
      links: { a: number; b: number; length: number; broken: number }[] = [];
    let pointer = { x: -999, y: -999 };
    const resize = () => {
      const rect = el.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(devicePixelRatio, FX.dpr);
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = [];
      links = [];
      const radius = Math.min(w, h) * 0.45;
      for (let ring = 0; ring <= rings; ring++)
        for (let radial = 0; radial < radials; radial++) {
          const a = (radial / radials) * Math.PI * 2,
            r = (radius * ring) / rings,
            x = w / 2 + Math.cos(a) * r,
            y = h / 2 + Math.sin(a) * r;
          nodes.push({
            x,
            y,
            px: x,
            py: y,
            ox: x,
            oy: y,
            pin: ring === rings || ring === 0,
          });
        }
      for (let ring = 1; ring <= rings; ring++)
        for (let j = 0; j < radials; j++) {
          for (const b of [
            (ring - 1) * radials + j,
            ring * radials + ((j + 1) % radials),
          ]) {
            const a = ring * radials + j;
            links.push({
              a,
              b,
              length: Math.hypot(
                nodes[a].x - nodes[b].x,
                nodes[a].y - nodes[b].y,
              ),
              broken: 0,
            });
          }
        }
      draw(performance.now());
    };
    function draw(t: number) {
      ctx.clearRect(0, 0, w, h);
      const active = !reduced && effects !== "off" && !document.hidden;
      for (const n of nodes) {
        if (n.pin || !active) continue;
        const vx = (n.x - n.px) * FX.hero.damping,
          vy = (n.y - n.py) * FX.hero.damping;
        n.px = n.x;
        n.py = n.y;
        const slow =
          el.closest("[data-sense=true]")?.getAttribute("data-sense") === "true"
            ? 0.25
            : 1;
        n.x += (vx + (n.ox - n.x) * FX.hero.stiffness) * slow;
        n.y += (vy + (n.oy - n.y) * FX.hero.stiffness) * slow;
        const dx = n.x - pointer.x,
          dy = n.y - pointer.y,
          d = Math.hypot(dx, dy);
        if (d < FX.hero.influence && d > 1) {
          n.x += (dx / d) * (1 - d / FX.hero.influence) * 5;
          n.y += (dy / d) * (1 - d / FX.hero.influence) * 5;
        }
      }
      ctx.strokeStyle = FX.colors[theme].cyan;
      ctx.lineWidth = 0.8;
      for (const l of links) {
        if (l.broken && t - l.broken < FX.hero.regrowMs) continue;
        if (l.broken) l.broken = 0;
        const a = nodes[l.a],
          b = nodes[l.b],
          dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy);
        if (active && d > l.length * FX.hero.snapRatio) {
          l.broken = t;
          continue;
        }
        if (active && d > 0) {
          const f = ((d - l.length) / d) * 0.2;
          if (!a.pin) {
            a.x += dx * f;
            a.y += dy * f;
          }
          if (!b.pin) {
            b.x -= dx * f;
            b.y -= dy * f;
          }
        }
        ctx.globalAlpha = 0.2 + 0.2 * Math.sin(l.a * 0.5 + t * 0.0002);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let i = 0; i < Math.min(FX.hero.dew, nodes.length); i++) {
        const n = nodes[(i * 7) % nodes.length];
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 0.001 + i);
        ctx.fillStyle = FX.colors[theme].cyan;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (active && visible) id = requestAnimationFrame(draw);
    }
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      cancelAnimationFrame(id);
      if (visible) draw(performance.now());
    });
    observer.observe(el);
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(id);
      resize();
    });
    ro.observe(el);
    el.parentElement?.addEventListener("pointermove", move);
    const visibility = () => {
      cancelAnimationFrame(id);
      if (!document.hidden && visible) draw(performance.now());
    };
    document.addEventListener("visibilitychange", visibility);
    resize();
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
      ro.disconnect();
      el.parentElement?.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [theme, effects, reduced]);
  return <canvas ref={ref} className="fan-hero-web" aria-hidden="true" />;
}
export function Skyline() {
  const ref = useRef<HTMLCanvasElement>(null),
    theme = useFan((s) => s.theme),
    effects = useFan((s) => s.effects),
    reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current!,
      ctx = el.getContext("2d")!;
    let id = 0,
      visible = true,
      w = 0,
      h = 0;
    const resize = () => {
      const r = el.getBoundingClientRect();
      w = r.width;
      h = r.height;
      const d = Math.min(devicePixelRatio, FX.dpr);
      el.width = w * d;
      el.height = h * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    function draw(t: number) {
      ctx.clearRect(0, 0, w, h);
      for (let layer = 0; layer < FX.skyline.layers; layer++) {
        const bw = w / FX.skyline.buildings,
          shift = reduced ? 0 : Math.min(scrollY, 1000) * (0.02 + layer * 0.01);
        for (let i = 0; i <= FX.skyline.buildings; i++) {
          const height = 35 + ((i * 73 + layer * 39) % 130),
            x = i * bw,
            y = h - height + layer * 24 + shift;
          ctx.fillStyle =
            layer === 2 ? FX.colors[theme].ink : FX.colors[theme].blue;
          ctx.globalAlpha = 0.25 + layer * 0.23;
          ctx.fillRect(x, y, bw - 2, height);
          ctx.fillStyle = FX.colors[theme].cyan;
          ctx.globalAlpha =
            0.12 +
            (reduced || effects !== "full"
              ? 0
              : Math.sin(t * 0.001 * FX.skyline.twinkleHz + i) * 0.08);
          for (let row = 0; row < 5; row++)
            ctx.fillRect(x + bw * 0.25, y + row * 18 + 10, 3, 5);
        }
      }
      ctx.globalAlpha = 1;
      if (visible && !document.hidden && !reduced && effects !== "off")
        id = requestAnimationFrame(draw);
    }
    const observer = new IntersectionObserver((e) => {
      visible = e[0].isIntersecting;
      cancelAnimationFrame(id);
      if (visible) draw(performance.now());
    });
    observer.observe(el);
    const ro = new ResizeObserver(() => {
      resize();
      cancelAnimationFrame(id);
      draw(performance.now());
    });
    ro.observe(el);
    const visibility = () => {
      cancelAnimationFrame(id);
      if (!document.hidden && visible) draw(performance.now());
    };
    document.addEventListener("visibilitychange", visibility);
    resize();
    draw(0);
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [theme, effects, reduced]);
  return <canvas ref={ref} className="fan-skyline" aria-hidden="true" />;
}
