import React from 'react';
import pictoBlue from '../assets/LG_picto_BleuMed.png';

export default function BackgroundMarkBlue({
  className = '',
  size = 560,
  opacity = 0.08,
  showFrom = 'block', // 'block' | 'sm' | 'md' | 'lg' | 'xl'
}) {
  const vis =
    showFrom === 'sm' ? 'sm:block' :
    showFrom === 'md' ? 'md:block' :
    showFrom === 'lg' ? 'lg:block' :
    showFrom === 'xl' ? 'xl:block' :
    'block';

  return (
    <img
      src={pictoBlue}
      alt=""
      aria-hidden
      className={`pointer-events-none absolute -z-10 select-none ${vis} ${className}`}
      style={{ width: size, height: size, opacity }}
      draggable={false}
    />
  );
}
