import React from 'react';

type Props = { className?: string; direction?: 'r' | 'l' | 't' | 'b' };
export default function GradientBar({ className = '', direction = 'r' }: Props) {
  return (
    <div
      className={className}
      style={{
        backgroundImage:
          direction === 't'
            ? 'linear-gradient(180deg,#4290D3,#6AAEE6,#2D4D9B)'
            : direction === 'b'
            ? 'linear-gradient(0deg,#4290D3,#6AAEE6,#2D4D9B)'
            : direction === 'l'
            ? 'linear-gradient(90deg,#4290D3,#6AAEE6,#2D4D9B)'
            : 'linear-gradient(90deg,#4290D3,#6AAEE6,#2D4D9B)',
      }}
    />
  );
}
