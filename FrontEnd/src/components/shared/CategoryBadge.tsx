import React from 'react';
import { getCategoryColor } from '@/constants/categories';

type Props = {
    category: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
};

const SIZES = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
};

export default function CategoryBadge({ category, className = '', size = 'sm' }: Props) {
    const colorClass = getCategoryColor(category);
    const sizeClass = SIZES[size];

    return (
        <span
            className={`inline-flex items-center rounded-full font-medium ${colorClass} ${sizeClass} ${className}`}
        >
            {category}
        </span>
    );
}
