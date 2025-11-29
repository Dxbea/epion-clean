import React from 'react';
import GradientBar from './articles/GradientBar';

export default function SectionHeader({
  title, right, showBar = true, className = ''
}:{ title: string; right?: React.ReactNode; showBar?: boolean; className?: string; }){
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {showBar && <GradientBar className="h-[4px] w-16 rounded-full" />}
      </div>
      {right}
    </div>
  );
}
