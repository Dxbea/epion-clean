import React from 'react';
import { getEpionBrandGradient } from '@/lib/color-utils';

type Props = { className?: string; direction?: 'r' | 'l' | 't' | 'b' };
export default function GradientBar({ className = '', direction = 'r' }: Props) {

  const brandGradient = getEpionBrandGradient();
  let grad = brandGradient;
  switch (direction) {
    case 'b': grad = brandGradient.replace('90deg', '180deg'); break;
    case 't': grad = brandGradient.replace('90deg', '0deg'); break;
    case 'l': grad = brandGradient.replace('90deg', '270deg'); break;
    case 'r':
    default:
      break;
  }

  return (
    <div
      className={className}
      style={{ backgroundImage: grad }}
    />
  );
}
