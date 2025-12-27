import React from 'react';
import { getEpionBrandGradient } from '@/lib/color-utils';

type Props = { className?: string; direction?: 'r' | 'l' | 't' | 'b' };
export default function GradientBar({ className = '', direction = 'r' }: Props) {

  // Vivid Colors: Blue -> Teal -> Emerald
  const STOPS = '#3B82F6 0%, #2DD4BF 50%, #10B981 100%';

  let grad = '';
  switch (direction) {
    case 'b': grad = `linear-gradient(180deg, ${STOPS})`; break;
    case 't': grad = `linear-gradient(0deg, ${STOPS})`; break;
    case 'l': grad = `linear-gradient(270deg, ${STOPS})`; break;
    case 'r':
    default:
      grad = `linear-gradient(90deg, ${STOPS})`; break;
  }

  return (
    <div
      className={className}
      style={{ backgroundImage: grad }}
    />
  );
}
