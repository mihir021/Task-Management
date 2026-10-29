import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, CheckCheck, GitBranch, Moon, Sun, Zap } from 'lucide-react';
import { useFan } from '../fan/store';
import { useReducedMotion } from '../fan/useMotion';
import { CornerWeb, SpiderCoverArt, WebClickEffects } from './SpiderArtwork';
import type { FanTheme, EffectsLevel } from '../fan/config';
import './thread-workspace.css';

export function WorkspaceExperience({ children }: { children: React.ReactNode }) {
  const theme = useFan(s => s.theme);
  const effects = useFan(s => s.effects);
  useEffect(() => {
    document.documentElement.dataset.workspaceEdition = theme;
    document.documentElement.classList.toggle('dark', theme !== 'classic');
    return () => { delete document.documentElement.dataset.workspaceEdition; };
  }, [theme]);
  return <div className="thread-workspace" data-thread-theme={theme} data-effects={effects}>
    <WebClickEffects />{children}
  </div>;
}

export function WorkspaceExperienceControls() {
  const { theme, effects, setTheme, setEffects } = useFan();
  return <div className="thread-controls">
    <div className="appearance-options" role="group" aria-label="Workspace appearance">
      {([{ id: 'classic', label: 'Classic', icon: Sun }, { id: 'noir', label: 'Noir', icon: Moon }, { id: '2099', label: '2099', icon: Zap }] as const).map(({ id, label, icon: Icon }) =>
        <button key={id} type="button" aria-label={`${label} appearance`} title={`${label} appearance`} aria-pressed={theme === id} onClick={() => setTheme(id as FanTheme)}><Icon size={13} /><span>{label}</span></button>
      )}
    </div>
    <label className="motion-control"><Zap size={13} aria-hidden="true" /><span className="sr-only">Animation level</span><select aria-label="Animation level" value={effects} onChange={e => setEffects(e.target.value as EffectsLevel)}>
      <option value="full">Full motion</option><option value="lite">Less motion</option><option value="off">Motion off</option>
    </select></label>
  </div>;
}

export function WorkspaceFocusHero({ onCreateTask, activeCount, completedCount, repositoryCount }: {
  onCreateTask: () => void; activeCount: number; completedCount: number; repositoryCount: number;
}) {
  const effects = useFan(s => s.effects);
  const reduced = useReducedMotion();
  const [folded, setFolded] = useState(() => localStorage.getItem('mihir_front_page_folded') === 'true');
  const total = activeCount + completedCount;
  const percent = total ? Math.round(completedCount / total * 100) : 0;
  return <section className="daily-thread-cover" aria-labelledby="focus-hero-title" onPointerMove={event=>{
    if(effects!=='full'||reduced||event.pointerType!=='mouse')return;
    const rect=event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--look-x',`${((event.clientX-rect.left)/rect.width-.5)*8}deg`);
    event.currentTarget.style.setProperty('--look-y',`${((event.clientY-rect.top)/rect.height-.5)*-6}deg`);
  }} onPointerLeave={event=>{event.currentTarget.style.setProperty('--look-x','0deg');event.currentTarget.style.setProperty('--look-y','0deg');}}>
    <header className="gazette-masthead"><button className="fold-cover-button" type="button" aria-expanded={!folded} aria-controls="daily-thread-story" onClick={()=>setFolded(previous=>{localStorage.setItem('mihir_front_page_folded',String(!previous));return !previous;})}>{folded ? 'Open front page' : 'Fold front page'}<ChevronDown size={11} /></button><CornerWeb className="masthead-web" /><span>THE PERSONAL RECORD OF</span><h2>The Daily Thread<span>✳</span></h2><p>MIHIR RATHOD <i /> CODE. CONNECT. CREATE. <i /> RAY EDITION</p></header>
    <div className="gazette-dateline"><span><span className="edition-dot" /> FRONT PAGE / ENGINEERING DESK</span><span>GREAT CODE. GREATER RESPONSIBILITY.</span></div>
    <div id="daily-thread-story" className={`cover-fold ${folded ? 'is-folded' : ''}`} aria-hidden={folded} inert={folded}><div className="cover-fold-inner"><div className="cover-story">
      <div className="cover-story-copy"><span className="story-label">EXTRA! EXTRA!</span><h3 id="focus-hero-title">Your friendly<br />neighborhood<br /><em>workspace.</em></h3><p>Every task has an origin story. Trace the bug, document the breakthrough, and take your next idea from local branch to launch.</p><button className="cover-action" type="button" onClick={onCreateTask}>START A NEW MISSION <ArrowUpRight size={16} /></button><span className="story-byline">BY MIHIR · BUILT ONE COMMIT AT A TIME</span></div>
      <SpiderCoverArt />
    </div></div></div>
    <footer className="cover-status-strip">
      <div><span className="cover-status-icon"><GitBranch size={16}/></span><strong>{repositoryCount}</strong><span>repositories<br /><small>in your web</small></span></div>
      <div><span className="mission-pulse"/><strong>{activeCount}</strong><span>active missions<br /><small>work in progress</small></span></div>
      <div><CheckCheck size={17}/><strong>{completedCount}</strong><span>completed<br /><small>filed in the archives</small></span></div>
      <div className="cover-completion"><span>{percent}% DELIVERED</span><div role="progressbar" aria-label="Tasks completed" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${percent}%`}} /></div></div>
    </footer>
  </section>;
}
