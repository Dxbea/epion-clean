import React from 'react';
import GradientBar from './articles/GradientBar';

export default function SectionHeader({
  title, right, showBar = true, className = ''
}:{ title: string; right?: React.ReactNode; showBar?: boolean; className?: string; }){
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-serif text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-[1.75rem]">{title}</h3>
        {showBar && <GradientBar className="h-[4px] w-16 rounded-full" />}
      </div>
      {right ? <div className="flex w-full sm:w-auto sm:justify-end">{right}</div> : null}
    </div>
  );
}
