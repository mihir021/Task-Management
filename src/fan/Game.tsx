import React, { useEffect, useRef, useState } from "react";
import { FX } from "./config";
import { useFan } from "./store";
import { useReducedMotion } from "./useMotion";
import { playSound } from "./sound";
export function WebSlinger() {
  const ref = useRef<HTMLCanvasElement>(null),
    [running, setRunning] = useState(false),
    [score, setScore] = useState(0),
    [combo, setCombo] = useState(0),
    [remaining, setRemaining] = useState(FX.game.seconds),
    [high, setHigh] = useState(
      () => Number(localStorage.getItem("thread-city-high-score")) || 0,
    ),
    [finished, setFinished] = useState(false);
  const [round, setRound] = useState(0),
    session = useRef({ elapsed: 0, points: 0, streak: 0, lastHit: -10000 });
  const effects = useFan((s) => s.effects),
    theme = useFan((s) => s.theme),
    reduced = useReducedMotion();
  const hit = useRef<(x?: number, y?: number) => void>(() => {}),
    slow = useRef(false);
  useEffect(() => {
    const el = ref.current!,
      ctx = el.getContext("2d")!;
    let width = 0,
      height = 0,
      id = 0,
      last = performance.now(),
      elapsed = session.current.elapsed,
      points = session.current.points,
      streak = session.current.streak,
      lastHit = session.current.lastHit,
      visible = true;
    const count = effects === "full" ? FX.game.targets : FX.game.liteTargets;
    let targets: { x: number; y: number; speed: number }[] = [];
    const target = () => ({
      x:
        FX.game.targetRadius +
        Math.random() * (width - FX.game.targetRadius * 2),
      y: 40 + Math.random() * (height - 80),
      speed: FX.game.baseSpeed * (0.7 + Math.random() * 0.7),
    });
    const resize = () => {
      const r = el.getBoundingClientRect();
      width = r.width;
      height = r.height;
      const d = Math.min(devicePixelRatio, FX.dpr);
      el.width = width * d;
      el.height = height * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      targets = Array.from({ length: count }, target);
    };
    hit.current = (x, y) => {
      if (!running) return;
      const t = performance.now();
      let index = -1;
      if (x === undefined)
        index = targets.reduce(
          (best, v, i) =>
            Math.abs(v.x - width / 2) < Math.abs(targets[best].x - width / 2)
              ? i
              : best,
          0,
        );
      else
        index = targets.findIndex(
          (v) =>
            Math.hypot(v.x - x, v.y - (y || 0)) < FX.game.targetRadius * 1.5,
        );
      if (index >= 0) {
        streak = t - lastHit < FX.game.comboMs ? streak + 1 : 1;
        lastHit = t;
        points += 10 * Math.min(streak, 5);
        session.current = { elapsed, points, streak, lastHit };
        setScore(points);
        setCombo(streak);
        targets[index] = target();
        playSound("thwip", useFan.getState().sound);
      } else {
        streak = 0;
        setCombo(0);
      }
    };
    function draw(t: number) {
      const elapsedFrame = t - last;
      const delta = Math.min(50, elapsedFrame);
      last = t;
      if (running && !document.hidden && visible) elapsed += elapsedFrame;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = FX.colors[theme].cyan;
      ctx.globalAlpha = 0.12;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const [i, v] of targets.entries()) {
        if (running && !reduced)
          v.x +=
            ((v.speed * delta) / 1000) *
            (slow.current ? FX.game.slowFactor : 1);
        if (v.x > width + FX.game.targetRadius) {
          v.x = -FX.game.targetRadius;
          streak = 0;
          setCombo(0);
        }
        ctx.strokeStyle = FX.colors[theme].cyan;
        ctx.fillStyle = i % 2 ? FX.colors[theme].red : FX.colors[theme].blue;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(v.x, v.y, FX.game.targetRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText("+", v.x, v.y + 4);
      }
      if (running) {
        session.current = { elapsed, points, streak, lastHit };
        const seconds = Math.max(
          0,
          Math.ceil(FX.game.seconds - elapsed / 1000),
        );
        setRemaining((previous) => (previous === seconds ? previous : seconds));
        if (seconds === 0) {
          const saved = Math.max(
            points,
            Number(localStorage.getItem("thread-city-high-score")) || 0,
          );
          localStorage.setItem("thread-city-high-score", String(saved));
          setHigh(saved);
          setRunning(false);
          setFinished(true);
          return;
        }
      }
      if (
        visible &&
        !document.hidden &&
        (running || (effects === "full" && !reduced))
      )
        id = requestAnimationFrame(draw);
    }
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      cancelAnimationFrame(id);
      if (visible) {
        last = performance.now();
        draw(last);
      }
    });
    observer.observe(el);
    const ro = new ResizeObserver(() => {
      resize();
      cancelAnimationFrame(id);
      last = performance.now();
      draw(last);
    });
    ro.observe(el);
    const visibility = () => {
      cancelAnimationFrame(id);
      if (!document.hidden && visible) {
        last = performance.now();
        draw(last);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    resize();
    draw(last);
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      hit.current = () => {};
      slow.current = false;
    };
  }, [running, effects, theme, reduced, round]);
  function finish() {
    const best = Math.max(
      session.current.points,
      Number(localStorage.getItem("thread-city-high-score")) || 0,
    );
    localStorage.setItem("thread-city-high-score", String(best));
    setHigh(best);
    setRunning(false);
    setFinished(true);
  }
  function start() {
    session.current = { elapsed: 0, points: 0, streak: 0, lastHit: -10000 };
    setRound((value) => value + 1);
    setScore(0);
    setCombo(0);
    setRemaining(FX.game.seconds);
    setFinished(false);
    setRunning(true);
    ref.current?.focus();
  }
  return (
    <div className="fan-game ink-panel">
      <div className="game-toolbar">
        <span>
          <small>SCORE</small>
          <b>{score.toString().padStart(4, "0")}</b>
        </span>
        <span>
          <small>COMBO</small>
          <b>×{combo}</b>
        </span>
        <span>
          <small>TIME</small>
          <b>{remaining}s</b>
        </span>
        <span>
          <small>LOCAL BEST</small>
          <b>{high}</b>
        </span>
      </div>
      <canvas
        ref={ref}
        tabIndex={0}
        role="application"
        aria-label="Web Slinger. Click moving targets, or press Enter to tag the nearest target. Hold Space to slow targets."
        onPointerDown={(event) => {
          const r = event.currentTarget.getBoundingClientRect();
          hit.current(event.clientX - r.left, event.clientY - r.top);
        }}
        onKeyDown={(event) => {
          if (event.key === " ") {
            event.preventDefault();
            slow.current = true;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            hit.current();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " ") slow.current = false;
        }}
        onBlur={() => {
          slow.current = false;
        }}
      />
      <div className="game-footer">
        <p>
          {finished
            ? `Round complete. ${score} points. ${score >= high && score > 0 ? "A new neighborhood benchmark." : "Every shot is another chance."}`
            : "Tag the targets. Chain hits for a combo. Hold Space for slow motion."}
        </p>
        <button className="fan-button red" onClick={start}>
          {running
            ? "Restart round"
            : finished
              ? "Play again ↗"
              : "Start 30-second round ↗"}
        </button>
        {running && (
          <button className="fan-button" onClick={finish}>
            End round
          </button>
        )}
      </div>
      <p className="fan-micro">
        KEYBOARD: TAB TO THE FIELD · ENTER TO TAG · HOLD SPACE TO SLOW. THE
        CLOCK PAUSES WHILE THE GAME IS OFF-SCREEN.
      </p>
    </div>
  );
}
