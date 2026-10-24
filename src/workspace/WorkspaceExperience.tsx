import React, { useEffect } from 'react';
import { ClickEffects, HeroWeb, OriginalSpider } from '../fan/Effects';
import { useFan } from '../fan/store';
import type { FanTheme, EffectsLevel } from '../fan/config';
import './thread-workspace.css';

export function WorkspaceExperience({ children }: { children: React.ReactNode }) {
  const theme = useFan(s => s.theme);
  const effects = useFan(s => s.effects);
  useEffect(() => {
    document.documentElement.dataset.workspaceEdition = theme;
    return () => { delete document.documentElement.dataset.workspaceEdition; };
  }, [theme]);
  return <div className="thread-workspace" data-thread-theme={theme} data-effects={effects}>
    <ClickEffects />
    {children}
  </div>;
}

export function WorkspaceExperienceControls() {
  const { theme, effects, setTheme, setEffects, sound, toggleSound } = useFan();
  return <div className="thread-controls">
    <label><span className="sr-only">Workspace edition</span><select aria-label="Workspace edition" value={theme} onChange={e => setTheme(e.target.value as FanTheme)}>
      <option value="classic">Classic</option><option value="noir">Noir</option><option value="2099">2099</option>
    </select></label>
    <label><span className="sr-only">Animation level</span><select aria-label="Animation level" value={effects} onChange={e => setEffects(e.target.value as EffectsLevel)}>
      <option value="full">FX Full</option><option value="lite">FX Lite</option><option value="off">FX Off</option>
    </select></label>
    <button type="button" aria-label={sound ? 'Mute workspace sounds' : 'Enable workspace sounds'} aria-pressed={sound} onClick={toggleSound}>{sound ? '♪ On' : '♪ Off'}</button>
  </div>;
}

export function WorkspaceComicHero({ onCreateTask }: { onCreateTask: () => void }) {
  return <section className="thread-hero" aria-labelledby="thread-hero-title">
    <div className="thread-hero-copy">
      <p className="thread-kicker"><span /> YOUR FRIENDLY NEIGHBORHOOD WORKSPACE</p>
      <h2 id="thread-hero-title">A LITTLE FOCUS.<br /><em>A LOT OF<br />FORWARD.</em></h2>
      <p>Big ideas. Small steps. Your tasks, code, and live services — all connected by one thread.</p>
      <button className="thread-hero-action" type="button" onClick={onCreateTask}>MAKE YOUR NEXT MOVE <span aria-hidden="true">↗</span></button>
    </div>
    <div className="thread-web-art"><HeroWeb /><span className="thread-comic-sticker">LET’S SHIP!</span><OriginalSpider className="thread-art-spider" /><span className="thread-art-caption">VOL. 01 / WORK IN MOTION</span></div>
  </section>;
}
