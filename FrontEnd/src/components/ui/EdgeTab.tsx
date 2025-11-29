import React from 'react';
import { FiChevronLeft, FiChevronRight, FiChevronUp, FiChevronDown } from 'react-icons/fi';

type Side = 'left' | 'right' | 'top' | 'bottom';

export default function EdgeTab({
  side, label, onClick, offset, className = '',
}: {
  side: Side;
  label: string;
  onClick: () => void;
  offset?: number;     // décalage depuis le bord en px
  className?: string;
}) {
  const base =
    'fixed z-50 select-none rounded-full bg-black/80 text-white text-xs px-3 py-1 shadow ' +
    'backdrop-blur hover:bg-black/90 transition';

  const pos: Record<Side, string> = {
    left:   'top-1/2 -translate-y-1/2',
    right:  'top-1/2 -translate-y-1/2',
    top:    'left-1/2 -translate-x-1/2',
    bottom: 'left-1/2 -translate-x-1/2',
  };

  const style: React.CSSProperties = {};
  if (side === 'left')   style.left   = (offset ?? 8) + 'px';
  if (side === 'right')  style.right  = (offset ?? 8) + 'px';
  if (side === 'top')    style.top    = (offset ?? 0) + 'px';
  if (side === 'bottom') style.bottom = (offset ?? 0) + 'px';

  const Icon = side === 'left' ? FiChevronLeft
            : side === 'right' ? FiChevronRight
            : side === 'top' ? FiChevronUp
            : FiChevronDown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${pos[side]} ${className}`}
      style={style}
      aria-label={label}
      title={label}
    >
      <span className="inline-flex items-center gap-1">
        <Icon />
        <span className="hidden sm:inline">{label}</span>
      </span>
    </button>
  );
}
