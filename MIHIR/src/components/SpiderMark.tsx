import React from 'react';
export function SpiderMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 120 140" fill="none" aria-hidden="true"><path d="M60 5C24 5 10 34 13 73c3 36 22 59 47 62 25-3 44-26 47-62C110 34 96 5 60 5Z" fill="currentColor"/><g stroke="#090e20" strokeWidth="1.4" opacity=".65"><path d="M60 6v128M16 39l89 52M104 39 15 91M29 15l57 108M91 15 34 123M13 66h94"/><path d="M42 10q18 25 36 0M23 26q37 25 74 0M14 51q46 22 92 0M14 80q46-16 92 0M23 108q37-21 74 0M40 128q20-27 40 0"/></g><path d="M24 46c12 4 22 11 29 21-1 14-7 20-15 16-10-5-13-18-14-37ZM96 46C84 50 74 57 67 67c1 14 7 20 15 16 10-5 13-18 14-37Z" fill="#f8fafc" stroke="#090e20" strokeWidth="5" strokeLinejoin="round"/></svg>;
}
