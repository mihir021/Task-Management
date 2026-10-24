import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { FX, type FanTheme, type EffectsLevel } from "./config";
import { useFan } from "./store";
import { useReducedMotion } from "./useMotion";
import {
  FanLoader,
  ClickEffects,
  HeroWeb,
  OriginalSpider,
  Skyline,
} from "./Effects";
import { playSound } from "./sound";
import { WebSlinger } from "./Game";
import { SlingerQuiz } from "./Quiz";
import { powers, suits, rogues, labParts } from "./content";
import "./fan.css";
gsap.registerPlugin(ScrollTrigger);
function AssetSlot({
  src,
  label,
  className = "",
}: {
  src: string;
  label: string;
  className?: string;
}) {
  return (
    <figure className={`fan-art-slot ${className}`}>
      <img
        src={src}
        alt={`${label}: labelled placeholder for your own or licensed artwork`}
        loading={className === "hero-slot" ? "eager" : "lazy"}
        width={className === "hero-slot" ? 900 : 600}
        height={className === "hero-slot" ? 1100 : 800}
      />
      <figcaption>
        <span>ART SLOT / {label}</span>
        <small>YOUR OWN OR LICENSED ARTWORK</small>
      </figcaption>
    </figure>
  );
}
function SectionLabel({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <p className="fan-label">
      // {number} {children}
    </p>
  );
}
export default function FanExperience() {
  const root = useRef<HTMLDivElement>(null),
    gallery = useRef<HTMLDivElement>(null),
    origin = useRef<HTMLDivElement>(null);
  const { theme, effects, sound, setTheme, setEffects, toggleSound } = useFan(),
    reduced = useReducedMotion();
  const [sense, setSense] = useState(false),
    [senseHeld, setSenseHeld] = useState(false),
    [lab, setLab] = useState(0),
    [flipped, setFlipped] = useState<string[]>([]),
    [newsletter, setNewsletter] = useState(false),
    [email, setEmail] = useState(""),
    [wipe, setWipe] = useState(false),
    [menu, setMenu] = useState(false);
  const trigger = useRef<() => void>(() => {}),
    senseRef = useRef(false),
    progress = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = "Thread City — An Unofficial Spider-Man Fan Experience";
    document.documentElement.classList.remove("dark");
    document.body.classList.add("fan-body");
    return () => document.body.classList.remove("fan-body");
  }, []);
  useEffect(() => {
    if (reduced || effects === "off") return;
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    let id = 0;
    const raf = (t: number) => {
      lenis.raf(t);
      id = requestAnimationFrame(raf);
    };
    id = requestAnimationFrame(raf);
    const context = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".fan-reveal").forEach((panel) => {
        gsap.fromTo(
          panel,
          {
            opacity: 0,
            y: 36,
            rotation: FX.panelAngle,
            clipPath: "inset(0 0 8% 0)",
          },
          {
            opacity: 1,
            y: 0,
            rotation: 0,
            clipPath: "inset(0 0 0% 0)",
            duration: FX.panelRevealSeconds,
            ease: "back.out(1.1)",
            scrollTrigger: { trigger: panel, start: "top 92%", once: true },
          },
        );
      });
      if (origin.current) {
        const line = origin.current.querySelector(".origin-thread");
        gsap.fromTo(
          line,
          { strokeDashoffset: 100 },
          {
            strokeDashoffset: 0,
            ease: "none",
            scrollTrigger: {
              trigger: origin.current,
              start: "top 65%",
              end: "bottom 40%",
              scrub: true,
            },
          },
        );
      }
    }, root);
    const media = () => {
      if (document.hidden) {
        lenis.stop();
        cancelAnimationFrame(id);
      } else {
        lenis.start();
        id = requestAnimationFrame(raf);
      }
    };
    document.addEventListener("visibilitychange", media);
    return () => {
      cancelAnimationFrame(id);
      context.revert();
      lenis.destroy();
      document.removeEventListener("visibilitychange", media);
    };
  }, [reduced, effects]);
  useEffect(() => {
    const update = () => {
      if (progress.current) {
        const max = document.documentElement.scrollHeight - innerHeight;
        progress.current.style.setProperty(
          "--scroll",
          String(max > 0 ? scrollY / max : 0),
        );
      }
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    if (reduced || effects === "off") {
      setSense(false);
      return;
    }
    let until = 0,
      lastTrigger = -10000,
      next =
        performance.now() +
        FX.sense.minRandomMs +
        Math.random() * (FX.sense.maxRandomMs - FX.sense.minRandomMs),
      id = 0,
      held = false,
      point = { x: 0, y: 0, t: performance.now() };
    const activate = () => {
      const t = performance.now();
      if (t - lastTrigger < FX.sense.cooldownMs || document.hidden) return;
      lastTrigger = t;
      until = t + FX.sense.durationMs;
      senseRef.current = true;
      setSense(true);
      playSound("sense", useFan.getState().sound);
    };
    trigger.current = activate;
    const move = (event: PointerEvent) => {
      const t = performance.now(),
        speed =
          Math.hypot(event.clientX - point.x, event.clientY - point.y) /
          Math.max(1, t - point.t);
      point = { x: event.clientX, y: event.clientY, t };
      if (
        speed > FX.sense.approachSpeed &&
        (event.target as Element).closest(".sense-target")
      )
        activate();
    };
    const typing = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest("input,textarea,select,[contenteditable=true]");
    const down = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "s" && !typing(event.target)) {
        held = true;
        setSenseHeld(true);
        activate();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "s") {
        held = false;
        setSenseHeld(false);
      }
    };
    const blur = () => {
      held = false;
      setSenseHeld(false);
    };
    function frame(t: number) {
      if (!document.hidden) {
        if (t > next) {
          activate();
          next =
            t +
            FX.sense.minRandomMs +
            Math.random() * (FX.sense.maxRandomMs - FX.sense.minRandomMs);
        }
        if (!held && t > until && senseRef.current) {
          senseRef.current = false;
          setSense(false);
        }
      }
      id = requestAnimationFrame(frame);
    }
    id = requestAnimationFrame(frame);
    window.addEventListener("pointermove", move);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) activate();
      },
      { threshold: 0.2 },
    );
    root.current
      ?.querySelectorAll<HTMLElement>(".fan-sticker")
      .forEach((sticker) =>
        sticker.style.setProperty(
          "--sticker-angle",
          `${(Math.random() * 2 - 1) * FX.stickerRotation}deg`,
        ),
      );
    const rogues = root.current?.querySelector("#rogues");
    if (rogues) observer.observe(rogues);
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      trigger.current = () => {};
      senseRef.current = false;
    };
  }, [effects, reduced]);
  function changeTheme(next: FanTheme) {
    if (theme === next) return;
    if (reduced || effects === "off") {
      setTheme(next);
      return;
    }
    setWipe(true);
    setTheme(next);
  }
  useEffect(() => {
    if (!wipe) return;
    const el = root.current?.querySelector(".theme-web-wipe");
    const animation = el?.animate(
      [
        { clipPath: "circle(0% at 90% 0%)", opacity: 1 },
        { clipPath: "circle(150% at 90% 0%)", opacity: 0.7, offset: 0.65 },
        { clipPath: "circle(150% at 90% 0%)", opacity: 0 },
      ],
      { duration: FX.wipeMs, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    if (animation) animation.onfinish = () => setWipe(false);
    return () => animation?.cancel();
  }, [wipe, theme]);
  const drag = useRef<{
    x: number;
    scroll: number;
    active: boolean;
    startX: number;
  }>({ x: 0, scroll: 0, active: false, startX: 0 });
  return (
    <div
      ref={root}
      className={`fan-site fan-theme-${theme}`}
      data-effects={effects}
      data-sense={sense || senseHeld}
    >
      <a className="fan-skip" href="#fan-main">
        Skip to content
      </a>
      <FanLoader />
      <ClickEffects />
      {wipe && <div className="theme-web-wipe" aria-hidden="true" />}
      <div className="sense-vignette" aria-hidden="true" />
      <div ref={progress} className="fan-scroll-thread" aria-hidden="true">
        <OriginalSpider />
      </div>
      <nav className="fan-nav" aria-label="Fan experience navigation">
        <a className="fan-brand" href="#top">
          <span>
            TC<span className="brand-dot">✳</span>
          </span>
          <small>
            THREAD CITY
            <br />
            UNOFFICIAL FAN EXPERIENCE
          </small>
        </a>
        <button
          className="fan-mobile-menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          Explore {menu ? "−" : "+"}
        </button>
        <div className={`fan-nav-links ${menu ? "is-open" : ""}`}>
          <a href="#origin" onClick={() => setMenu(false)}>
            Origin
          </a>
          <a href="#powers" onClick={() => setMenu(false)}>
            Powers
          </a>
          <a href="#suits" onClick={() => setMenu(false)}>
            The suits
          </a>
          <a href="#play" onClick={() => setMenu(false)}>
            Play ↗
          </a>
          <a className="workspace-link" href="/workspace">
            Workspace ↗
          </a>
        </div>
        <div className="fan-controls">
          <label>
            <span className="fan-sr">Color theme</span>
            <select
              value={theme}
              onChange={(e) => changeTheme(e.target.value as FanTheme)}
              aria-label="Color theme"
            >
              <option value="classic">Classic</option>
              <option value="noir">Noir</option>
              <option value="2099">2099</option>
            </select>
          </label>
          <label>
            <span className="fan-sr">Effects level</span>
            <select
              value={effects}
              onChange={(e) => setEffects(e.target.value as EffectsLevel)}
              aria-label="Effects level"
            >
              <option value="full">FX Full</option>
              <option value="lite">FX Lite</option>
              <option value="off">FX Off</option>
            </select>
          </label>
          <button
            aria-pressed={sound}
            onClick={() => {
              toggleSound();
              if (!sound) playSound("thwip", true);
            }}
            aria-label={sound ? "Turn sound off" : "Turn sound on"}
          >
            {sound ? "◖ Sound on" : "◖ Sound off"}
          </button>
        </div>
      </nav>
      <main id="fan-main">
        <section id="top" className="fan-hero">
          <div className="hero-issue fan-label">
            VOL. 01 / A LOVE LETTER TO THE LEAP <span>EST. IN IMAGINATION</span>
          </div>
          <div className="fan-hero-grid">
            <div className="fan-hero-copy">
              <div className="fan-kicker">
                <span className="live-dot" />
                THE CITY DOESN’T STOP. NEITHER DOES HOPE.
              </div>
              <h1 className="fan-headline">
                A LITTLE
                <br />
                COURAGE.
                <br />
                <em>
                  A LOT OF
                  <br />
                  HANG TIME.
                </em>
              </h1>
              <p>
                No cape. No perfect plan. Just the choice to reach out, hold on,
                and make the next leap count. An unofficial celebration of
                Spider-Man’s enduring spirit.
              </p>
              <div className="fan-actions">
                <a className="fan-button red sense-target" href="#origin">
                  Follow the thread <span>↘</span>
                </a>
                <a className="fan-button" href="#play">
                  Take your shot ↗
                </a>
              </div>
              <p className="fan-micro">
                CLICK ANYWHERE TO CAST A THREAD · HOLD S FOR SPIDER-SENSE
              </p>
            </div>
            <div
              className="fan-hero-art sense-target"
              onPointerMove={(e) => {
                if (reduced || effects !== "full" || e.pointerType === "touch")
                  return;
                const r = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty(
                  "--rx",
                  `${-(e.clientY - r.top - r.height / 2) / 40}deg`,
                );
                e.currentTarget.style.setProperty(
                  "--ry",
                  `${(e.clientX - r.left - r.width / 2) / 40}deg`,
                );
              }}
              onPointerLeave={(e) => {
                e.currentTarget.style.setProperty("--rx", "0deg");
                e.currentTarget.style.setProperty("--ry", "0deg");
              }}
            >
              <HeroWeb />
              <AssetSlot
                src="/assets/hero.png"
                label="HERO / 900 × 1100"
                className="hero-slot"
              />
              <span className="fan-sticker">THWIP!</span>
              <div className="hero-coordinate fan-label">
                40° N / SOMEWHERE ABOVE THE ORDINARY
              </div>
            </div>
          </div>
          <Skyline />
          <div className="hero-bottom fan-label">
            <span>NO OFFICIAL ART. ALL ORIGINAL ENERGY.</span>
            <a href="#origin">SCROLL TO SWING ↓</a>
          </div>
        </section>
        <div className="fan-marquee" aria-hidden="true">
          <span>
            GREAT IDEAS. GREATER RESPONSIBILITY. / KEEP YOUR HEAD UP. / MAKE THE
            CONNECTION. /{" "}
          </span>
        </div>
        <section
          id="origin"
          ref={origin}
          className="fan-section origin-section"
        >
          <div className="origin-sticky">
            <SectionLabel number="01">THE ORIGIN THREAD</SectionLabel>
            <h2>
              Extraordinary
              <br />
              starts with
              <br />
              <em>an ordinary choice.</em>
            </h2>
            <p>
              Not a retelling. A few ideas that keep drawing us back: curiosity,
              consequence, and the decision to help.
            </p>
            <span className="fan-sticker small">ONE MORE TRY.</span>
          </div>
          <div className="origin-nodes">
            <svg
              className="origin-line"
              viewBox="0 0 40 900"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                className="origin-thread"
                d="M20 0C-15 120 55 180 20 300S-15 480 20 600 55 780 20 900"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                pathLength="100"
                strokeDasharray="100"
              />
            </svg>
            {[
              [
                "A curious mind",
                "Ask the awkward question. Look closer at the thing everybody else calls ordinary. Wonder is where the first connection begins.",
              ],
              [
                "A difficult lesson",
                "Having the ability to act does not make the choice easy. The meaningful part is deciding what to do with what you have.",
              ],
              [
                "A reason to return",
                "The city will need help tomorrow, too. Heroism can be a habit: a small kindness, repeated when nobody is keeping score.",
              ],
            ].map(([title, copy], i) => (
              <article className="ink-panel origin-node fan-reveal" key={title}>
                <span className="fan-label">THREAD 0{i + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="powers" className="fan-section powers-section">
          <div className="fan-section-heading">
            <div>
              <SectionLabel number="02">POWERS, REFRAMED</SectionLabel>
              <h2>
                More than
                <br />
                <em>party tricks.</em>
              </h2>
            </div>
            <p>
              Six extraordinary abilities. Six very human ways to think about
              the world.
            </p>
            <span className="fan-sticker small">THWACK!</span>
          </div>
          <div className="power-grid">
            {powers.map(([number, title, copy, icon]) => (
              <article
                className="ink-panel power-card fan-reveal sense-target"
                key={title}
                onPointerMove={(e) => {
                  if (effects !== "full" || reduced) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty(
                    "--tilt",
                    `${(e.clientX - r.left - r.width / 2) / 45}deg`,
                  );
                }}
                onPointerLeave={(e) =>
                  e.currentTarget.style.setProperty("--tilt", "0deg")
                }
              >
                <div className="power-top">
                  <span>{icon}</span>
                  <span className="fan-label">PWR / {number}</span>
                </div>
                <h3>{title}</h3>
                <p>{copy}</p>
                <div className="corner-strands" aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>
        <section id="suits" className="fan-section suits-section">
          <div className="fan-section-heading">
            <div>
              <SectionLabel number="03">THE SUIT STUDY</SectionLabel>
              <h2>
                Different threads.
                <br />
                <em>Same intention.</em>
              </h2>
            </div>
            <div>
              <p>
                Six original mood boards for your licensed artwork. No suit
                designs are reproduced here.
              </p>
              <div className="fan-actions">
                <button
                  className="fan-button"
                  aria-label="Previous suits"
                  onClick={() =>
                    gallery.current?.scrollBy({
                      left: -340,
                      behavior: reduced ? "auto" : "smooth",
                    })
                  }
                >
                  ←
                </button>
                <button
                  className="fan-button"
                  aria-label="Next suits"
                  onClick={() =>
                    gallery.current?.scrollBy({
                      left: 340,
                      behavior: reduced ? "auto" : "smooth",
                    })
                  }
                >
                  →
                </button>
              </div>
            </div>
          </div>
          <div
            ref={gallery}
            className="suit-gallery"
            aria-label="Suit mood board gallery"
            tabIndex={0}
            onPointerDown={(e) => {
              if ((e.target as Element).closest("button")) return;
              drag.current = {
                x: e.clientX,
                startX: e.clientX,
                scroll: e.currentTarget.scrollLeft,
                active: true,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current.active) return;
              e.currentTarget.scrollLeft =
                drag.current.scroll - (e.clientX - drag.current.x);
            }}
            onPointerUp={() => {
              drag.current.active = false;
            }}
            onPointerCancel={() => {
              drag.current.active = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                e.currentTarget.scrollBy({
                  left: e.key === "ArrowRight" ? 340 : -340,
                  behavior: reduced ? "auto" : "smooth",
                });
              }
            }}
          >
            {suits.map(([title, copy, number]) => (
              <article className="suit-card ink-panel" key={number}>
                <AssetSlot
                  src={`/assets/suit-${number}.jpg`}
                  label={`SUIT ${number} / 600 × 800`}
                />
                <div>
                  <span className="fan-label">STUDY / {number}</span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="fan-micro">
            DRAG THE STRIP · SWIPE ON MOBILE · ARROW KEYS OR BUTTONS TO EXPLORE
          </p>
        </section>
        <section id="lab" className="fan-section lab-section">
          <div>
            <SectionLabel number="04">WEB-SHOOTER LAB</SectionLabel>
            <h2>
              A good idea
              <br />
              <em>comes apart.</em>
            </h2>
            <p>
              Tap the numbered hotspots. Explore the layers of an entirely
              fictional mechanism, drawn as a blueprint for imagination.
            </p>
            <div className="ink-panel lab-description" aria-live="polite">
              <span className="fan-label">COMPONENT 0{lab + 1}</span>
              <h3>{labParts[lab].title}</h3>
              <p>{labParts[lab].copy}</p>
            </div>
          </div>
          <div className="blueprint ink-panel">
            <svg viewBox="0 0 600 500" aria-hidden="true">
              <defs>
                <pattern
                  id="lab-grid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M24 0H0V24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth=".4"
                  />
                </pattern>
              </defs>
              <rect width="600" height="500" fill="url(#lab-grid)" />
              <g fill="none" stroke="currentColor" strokeWidth="2">
                <path
                  strokeDasharray="4 5"
                  d="M100 380 500 110M130 400 530 130"
                />
                <path d="m100 310 100-60 120 40-100 65zM100 310v50l120 45 100-65v-50M220 355v50M200 250v50" />
                <path d="m250 230 80-50 100 35-80 50zM250 230v35l100 40 80-55v-35M350 265v40" />
                <ellipse
                  cx="410"
                  cy="165"
                  rx="56"
                  ry="26"
                  transform="rotate(-24 410 165)"
                />
                <ellipse
                  cx="410"
                  cy="130"
                  rx="56"
                  ry="26"
                  transform="rotate(-24 410 130)"
                />
                <path d="m359 151 0 35M460 108v34" />
                <path d="m455 70 25-15 40 15-25 17zM455 70v20l40 17 25-18V70" />
                <path
                  strokeDasharray="3 5"
                  d="M200 280 140 190M330 230 240 120M410 140 350 60M490 75 550 30"
                />
              </g>
              <text
                x="25"
                y="470"
                fill="currentColor"
                fontFamily="monospace"
                fontSize="12"
              >
                EXPLODED VIEW / FICTIONAL CONCEPT / NOT A BUILD PLAN
              </text>
            </svg>
            {labParts.map((part, i) => (
              <button
                key={part.title}
                style={{
                  left: `${[24, 43, 65, 82][i]}%`,
                  top: `${[54, 39, 25, 11][i]}%`,
                }}
                className={lab === i ? "active" : ""}
                aria-label={`Inspect ${part.title}`}
                aria-pressed={lab === i}
                onClick={() => setLab(i)}
              >
                0{i + 1}
              </button>
            ))}
          </div>
        </section>
        <section id="rogues" className="fan-section rogues-section">
          <div className="fan-section-heading">
            <div>
              <SectionLabel number="05">ROGUES GALLERY</SectionLabel>
              <h2>
                Something feels
                <br />
                <em>a little off.</em>
              </h2>
            </div>
            <p>
              Six original, non-canonical threats to the city. Flip a dossier to
              find the counterplay. Your spider-sense may have an opinion.
            </p>
          </div>
          <div className="rogue-grid">
            {rogues.map(([name, type, danger, copy, counter], i) => (
              <button
                className={`rogue-card ink-panel fan-reveal sense-target ${flipped.includes(name) ? "is-flipped" : ""}`}
                key={name}
                aria-expanded={flipped.includes(name)}
                onClick={() => {
                  trigger.current();
                  setFlipped((previous) =>
                    previous.includes(name)
                      ? previous.filter((v) => v !== name)
                      : [...previous, name],
                  );
                }}
              >
                <div className="rogue-inner">
                  <div
                    className="rogue-front"
                    aria-hidden={flipped.includes(name)}
                  >
                    <AssetSlot
                      src={`/assets/rogue-0${i + 1}.jpg`}
                      label={`ROGUE 0${i + 1} / 600 × 800`}
                    />
                    <span className="fan-label">ORIGINAL DOSSIER 0{i + 1}</span>
                    <h3>{name}</h3>
                    <p>{type}</p>
                    <div className="danger-meter">
                      <span style={{ width: `${danger}%` }} />
                    </div>
                    <small>
                      DANGER INDEX {danger}/100 · FLIP TO INVESTIGATE ↗
                    </small>
                  </div>
                  <div
                    className="rogue-back"
                    aria-hidden={!flipped.includes(name)}
                  >
                    <span className="fan-label">
                      COUNTERPLAY / ORIGINAL FICTION
                    </span>
                    <h3>{name}</h3>
                    <p>{copy}</p>
                    <strong>{counter}</strong>
                    <span className="fan-label">FLIP TO CLOSE ↺</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section id="timeline" className="fan-section media-section">
          <SectionLabel number="06">ACROSS THE MEDIUMS</SectionLabel>
          <h2>
            One idea.
            <br />
            <em>More ways to feel it.</em>
          </h2>
          <p>
            An interpretive timeline of storytelling forms, rather than a
            publication chronology.
          </p>
          <div className="media-timeline">
            {[
              [
                "01 / COMICS",
                "Between the panels",
                "Ink makes room for imagination. A still frame can hold an impossible moment; the reader supplies the movement.",
              ],
              [
                "02 / FILMS",
                "Between the frames",
                "Light, scale, and sound turn a leap into a feeling. The city becomes a character you can almost reach out and touch.",
              ],
              [
                "03 / GAMES",
                "Between the inputs",
                "Now the next move is yours. A small choice becomes a route, a rhythm, and a reason to try the swing again.",
              ],
            ].map(([label, title, copy]) => (
              <article className="ink-panel fan-reveal" key={label}>
                <span className="fan-label">{label}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="play" className="fan-section play-section">
          <div className="fan-section-heading">
            <div>
              <SectionLabel number="07">WEB SLINGER / MINI-GAME</SectionLabel>
              <h2>
                Your turn
                <br />
                <em>to take the shot.</em>
              </h2>
            </div>
            <p>
              Thirty seconds. Moving targets. One good rhythm. Your best score
              lives in this browser, with no account required.
            </p>
          </div>
          <div className="game-sticker">
            <span className="fan-sticker small">BAM!</span>
          </div>
          <WebSlinger />
        </section>
        <section id="quiz" className="fan-section quiz-section">
          <div>
            <SectionLabel number="08">FIND YOUR FREQUENCY</SectionLabel>
            <h2>
              Which kind
              <br />
              of web-slinger
              <br />
              <em>are you?</em>
            </h2>
            <p>
              Five small choices. An original archetype. No right answers, no
              canon rankings—just a playful look at the instinct that keeps you
              moving.
            </p>
            <span className="fan-sticker small">YOUR STORY.</span>
          </div>
          <SlingerQuiz />
        </section>
        <section className="fan-section fan-newsletter">
          <div>
            <SectionLabel number="09">KEEP THE THREAD ALIVE</SectionLabel>
            <h2>
              The next chapter
              <br />
              <em>starts with a connection.</em>
            </h2>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) setNewsletter(true);
            }}
          >
            <label htmlFor="fan-email">
              Email for your local interest list
            </label>
            <div>
              <input
                id="fan-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@yourcity.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setNewsletter(false);
                }}
              />
              <button className="fan-button red" type="submit">
                Count me in ↗
              </button>
            </div>
            <p aria-live="polite">
              {newsletter
                ? "You’re on the list for this visit. Nothing was sent or saved to a server."
                : "A front-end demonstration only. No subscription is created and no email is transmitted."}
            </p>
          </form>
        </section>
      </main>
      <footer className="fan-footer">
        <a className="fan-footer-brand" href="#top">
          THREAD
          <br />
          CITY<span>✳</span>
        </a>
        <div>
          <p>
            For the wonder. For the leap. For everyone who keeps showing up.
          </p>
          <nav aria-label="Footer links">
            <a
              href="https://www.mihir21.site/"
              target="_blank"
              rel="noreferrer"
            >
              Mihir’s portfolio ↗
            </a>
            <a
              href="https://github.com/mihir021"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
            <a
              href="https://www.marvel.com/characters/spider-man-peter-parker"
              target="_blank"
              rel="noreferrer"
            >
              Official character page ↗
            </a>
            <a href="/workspace">Open workspace ↗</a>
            <a href="#top">Back to the rooftops ↑</a>
          </nav>
          <small>
            Unofficial fan project. Spider-Man and related characters are
            trademarks of Marvel. Not affiliated or endorsed.
          </small>
          <small>
            Original words, abstract visuals, and fictional dossiers. Artwork
            slots are reserved for your own or licensed images.
          </small>
        </div>
      </footer>
    </div>
  );
}
