import React from 'react';

/**
 * Parses text to identify citation patterns like [1], [2] and renders them interactively
 * if highlight mode is active.
 * 
 * @param text The raw text content to parse.
 * @param isHighlightMode Whether highlight mode is active.
 * @param onSourceClick Callback when a source citation is clicked.
 * @returns Array of React nodes (text segments and buttons).
 */
export const renderContentWithHighlights = (
    text: string,
    isHighlightMode: boolean,
    onSourceClick: (sourceIndex: number) => void
): React.ReactNode[] => {
    if (!text) return [];

    // Regex to match [n] where n is a number
    const regex = /\[(\d+)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        const sourceNumber = parseInt(match[1], 10);
        const fullMatch = match[0];

        if (isHighlightMode) {
            parts.push(
                <button
                    key={`source-${match.index}`}
                    onClick={() => onSourceClick(sourceNumber)}
                    className="
            mx-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center 
            rounded bg-teal-100 px-1 text-xs font-bold text-teal-800 
            transition-colors hover:bg-teal-200 cursor-pointer align-baseline
            dark:bg-teal-900/50 dark:text-teal-200 dark:hover:bg-teal-900/80
          "
                    title={`Voir la source ${sourceNumber}`}
                >
                    {sourceNumber}
                </button>
            );
        } else {
            // Non-interactive but distinct styling for readabilty
            parts.push(
                <span
                    key={`source-${match.index}`}
                    className="text-gray-500 font-medium dark:text-gray-400"
                >
                    {fullMatch}
                </span>
            );
        }

        lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
};
