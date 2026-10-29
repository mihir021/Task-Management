import React, { useEffect, useId, useState } from 'react';
import { useFan } from '../fan/store';
import { useReducedMotion } from '../fan/useMotion';

/** Vector cover illustration: crisp at every size, with no image downloads. */
export function SpiderMask({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const outline = 'M50 5C22 5 8 25 10 53C12 79 31 101 50 109C69 101 88 79 90 53C92 25 78 5 50 5Z';
  return <svg viewBox="0 0 100 114" className={className} aria-hidden="true">
    <defs><clipPath id={`mask-${id}`}><path d={outline} /></clipPath><linearGradient id={`red-${id}`} x1="0" x2="1"><stop stopColor="#e5323d"/><stop offset="1" stopColor="#b71224"/></linearGradient></defs>
    <path d={outline} fill={`url(#red-${id})`} stroke="#181923" strokeWidth="3" />
    <g clipPath={`url(#mask-${id})`} fill="none" stroke="#231923" strokeWidth="1.1" opacity=".7">
      <path d="M50 0V116M50 55L15 0M50 55L85 0M50 55L0 25M50 55L100 25M50 55L0 62M50 55L100 62M50 55L8 100M50 55L92 100M50 55L27 115M50 55L73 115" />
      <path d="M20 7Q50 24 80 7M8 20Q29 39 50 32Q71 39 92 20M1 40Q22 52 50 45Q78 52 99 40M0 70Q24 62 50 70Q76 62 100 70M9 88Q29 78 50 88Q71 78 91 88M22 103Q37 96 50 102Q63 96 78 103" />
    </g>
    <path d="M16 34Q29 37 44 53Q41 69 29 69Q17 64 16 34ZM84 34Q71 37 56 53Q59 69 71 69Q83 64 84 34Z" fill="#f8f5e9" stroke="#171923" strokeWidth="5" strokeLinejoin="round" />
    <path d="M18 17Q29 7 42 8" fill="none" stroke="#ff7b71" strokeWidth="2" opacity=".6" />
  </svg>;
}

export function CornerWeb({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 180 180" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth=".7">
      {[0,18,36,54,72,90].map(a => <path key={a} d={`M0 0L${180*Math.cos(a*Math.PI/180)} ${180*Math.sin(a*Math.PI/180)}`} />)}
      {[24,50,78,110,148,178].map(r => <path key={r} d={Array.from({length:6},(_,i)=>{const a=i*Math.PI/10;const x=r*Math.cos(a),y=r*Math.sin(a);if(!i)return `M${x} ${y}`;const p=(i-.5)*Math.PI/10;return `Q${r*.88*Math.cos(p)} ${r*.88*Math.sin(p)} ${x} ${y}`;}).join(' ')} />)}
    </g>
  </svg>;
}

export function SpiderCoverArt() {
  const id = useId().replace(/:/g, '');
  return <div className="spider-cover-art" aria-hidden="true">
    <svg className="cover-city" viewBox="0 0 430 320" fill="none">
      <defs><pattern id={`dots-${id}`} width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="currentColor" /></pattern></defs>
      <circle cx="250" cy="145" r="130" fill={`url(#dots-${id})`} opacity=".13" />
      <circle cx="250" cy="145" r="128" stroke="currentColor" opacity=".15" />
      <g stroke="currentColor" strokeWidth=".9" opacity=".3">
        <path d="M0 302H430M8 302V218H46V302M15 218V205H37V218M52 302V170H102V302M63 170V154H90V170M76 154V128M110 302V240H146V302M156 302V198H197V302M205 302V230H246V302M258 302V188H301V302M310 302V208H347V302M356 302V159H407V302M366 159V147H397V159M381 147V119" />
        {Array.from({length:6},(_,r)=><path key={r} d={`M61 ${184+r*17}H69M82 ${184+r*17}H91M365 ${176+r*18}H375M388 ${176+r*18}H398`} />)}
        <path d="M165 212H174M180 212H189M165 231H174M180 231H189M165 250H174M180 250H189M268 202H277M284 202H293M268 223H277M284 223H293M268 244H277M284 244H293" />
      </g>
      <g className="cover-web-lines" stroke="currentColor" opacity=".35">
        <path d="M425 0L98 224M425 0L203 268M425 0L301 292M425 0L395 303M425 0L12 48M425 0L25 131" />
        <path d="M347 9Q355 27 362 43Q372 55 379 62Q393 70 404 72Q416 73 419 74M271 18Q291 59 299 86Q327 104 333 123Q360 136 382 139Q401 141 412 145M185 27Q215 90 230 131Q269 162 281 187Q322 205 354 209Q385 217 405 218M104 37Q139 122 163 179Q208 220 225 245Q277 274 322 280" />
      </g>
    </svg>
    <div className="cover-mask-wrap"><SpiderMask className="cover-mask" /><span className="cover-mask-shadow" /></div>
    <span className="cover-caption">FIG. 01 — YOUR FRIENDLY NEIGHBORHOOD DEVELOPER</span>
    <span className="cover-stamp">ON<br/>DUTY</span>
    <span className="cover-coordinate">YOUR NEXT CHAPTER</span>
  </div>;
}

export function WebClickEffects() {
  const effects = useFan(s => s.effects);
  const reduced = useReducedMotion();
  const [bursts, setBursts] = useState<Array<{id:number;x:number;y:number}>>([]);
  useEffect(() => {
    setBursts([]);
    if (effects !== 'full' || reduced) return;
    let sequence = 0;
    const click = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.thread-workspace button:not(:disabled)')) return;
      setBursts(previous => [...previous.slice(-3), {id:++sequence,x:event.clientX,y:event.clientY}]);
    };
    window.addEventListener('pointerdown',click);
    return () => window.removeEventListener('pointerdown',click);
  },[effects,reduced]);
  return <div className="web-burst-layer" aria-hidden="true">{bursts.map(burst => <svg key={burst.id} className="web-click-burst" style={{left:burst.x,top:burst.y}} viewBox="-35 -35 70 70" onAnimationEnd={()=>setBursts(previous=>previous.filter(item=>item.id!==burst.id))}>
    <g fill="none" stroke="currentColor" strokeWidth=".7">{Array.from({length:8},(_,i)=><path key={i} d={`M0 0L${32*Math.cos(i*Math.PI/4)} ${32*Math.sin(i*Math.PI/4)}`} />)}{[12,24].map(r=><path key={r} d={Array.from({length:9},(_,i)=>`${i?'L':'M'}${r*Math.cos(i*Math.PI/4)} ${r*Math.sin(i*Math.PI/4)}`).join(' ')} />)}</g>
  </svg>)}</div>;
}
