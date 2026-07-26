import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
    content: string;
    className?: string;
    // Props pour le surlignage (Feature Chat)
    isHighlightActive?: boolean;
    sources?: any[];
    onSourceClick?: (id: number) => void;
}

export default function MarkdownRenderer({ content, className = '', isHighlightActive = false, sources = [], onSourceClick }: MarkdownRendererProps) {
    const [selectedCitationKey, setSelectedCitationKey] = useState<string | null>(null);

    // --- LOGIQUE EXTRAITE DE ChatMessage.tsx ---

    const getSourceDetails = (id: number) => {
        const source = sources.find((s: any) => s.id === id) || sources[id - 1]; // Fallback index-based matching if needed
        return {
            name: source?.name || source?.domain || 'Source',
            domain: source?.domain || ''
        };
    };

    const extractCitationIds = (children: React.ReactNode): number[] => {
        let ids: number[] = [];
        React.Children.forEach(children, (child) => {
            if (typeof child === 'string') {
                const matches = child.match(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
                if (matches) {
                    matches.forEach(m => {
                        const inner = m.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
                        if (inner) {
                            inner[1].split(',').forEach(n => ids.push(parseInt(n.trim())));
                        }
                    });
                }
            } else if (React.isValidElement(child) && (child.props as any).children) {
                ids = ids.concat(extractCitationIds((child.props as any).children));
            }
        });
        return [...new Set(ids)];
    };

    const processChildrenForCitations = (children: React.ReactNode, isActive: boolean = false): React.ReactNode => {
        return React.Children.map(children, (child) => {
            if (typeof child === 'string') {
                // DEBUG: Voir ce que le renderer reçoit
                // if (child.includes('[')) console.log("🔍 Markdown Text Node:", child);

                const parts = child.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);
                return parts.map((part, i) => {
                    const match = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
                    if (match) {
                        console.log("✅ CITATION MATCH FOUND:", match[1]); // Confirme que la regex marche
                        const nums = match[1].split(',').map(n => n.trim());
                        return (
                            <sup key={i} className="inline-flex gap-0.5 ml-0.5 align-super cursor-pointer select-none">
                                {nums.map((num, idx) => {
                                    const idVal = parseInt(num);
                                    return (
                                        <span
                                            key={idx}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                console.log("🎯 Citation Clicked:", idVal);
                                                if (onSourceClick) onSourceClick(idVal);
                                            }}
                                            className={`text-[10px] font-bold transition-colors ${isActive
                                                ? 'text-[#38A6A6] underline decoration-2 underline-offset-2'
                                                : 'text-[#38A6A6] hover:text-[#38A6A6]/80'
                                                }`}
                                            title={`Voir la source ${num}`}
                                        >
                                            {num}
                                        </span>
                                    )
                                })}
                            </sup>
                        );
                    }
                    return part;
                });
            }

            if (React.isValidElement(child)) {
                return React.cloneElement(child as React.ReactElement<any>, {
                    children: processChildrenForCitations((child.props as any).children, isActive)
                });
            }
            return child;
        });
    };

    const markdownComponents: any = {
        p: ({ children, ...props }: any) => {
            const citationIds = extractCitationIds(children);
            const isSourced = citationIds.length > 0;
            const citationKey = citationIds.sort().join(',');
            const isActive = selectedCitationKey === citationKey;

            const handleBlockClick = (e: React.MouseEvent) => {
                if (isSourced && isHighlightActive) {
                    e.stopPropagation();
                    if (isActive && onSourceClick) {
                        citationIds.forEach(id => onSourceClick(id));
                    } else {
                        setSelectedCitationKey(citationKey);
                    }
                }
            };

            const highlightClasses = isSourced && isHighlightActive
                ? isActive
                    ? 'bg-[#38A6A6]/30 border-[#38A6A6] ring-1 ring-[#38A6A6] text-gray-900 dark:text-white'
                    : 'bg-[#38A6A6]/10 border-[#38A6A6]/40 text-gray-900 dark:text-gray-100 hover:bg-[#38A6A6]/20'
                : '';

            const wrapperClasses = isSourced && isHighlightActive
                ? `px-1 py-0.5 mx-0.5 rounded-[4px] box-decoration-clone cursor-pointer transition-all duration-200 border-b-2 ${highlightClasses}`
                : '';

            return (
                <p className={`mb-4 leading-relaxed ${className}`} {...props}>
                    <span className={`relative inline ${wrapperClasses}`} onClick={handleBlockClick}>
                        {processChildrenForCitations(children, isActive)}

                        {/* POPOVER */}
                        {isActive && isSourced && isHighlightActive && (
                            <span
                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[280px] z-50 animate-in fade-in zoom-in-95 duration-200"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <span className="block bg-[#111111] text-white text-xs rounded-xl shadow-2xl border border-white/10 p-2">
                                    <span className="flex flex-col gap-1">
                                        {citationIds.map(id => (
                                            <button
                                                key={id}
                                                onClick={() => onSourceClick && onSourceClick(id)}
                                                className="flex items-center gap-3 hover:bg-white/10 p-2 rounded-lg transition-colors text-left group w-full"
                                            >
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#38A6A6] text-[10px] text-black font-bold">
                                                    {id}
                                                </span>
                                                <span className="flex flex-col overflow-hidden">
                                                    <span className="truncate font-medium text-gray-100 text-[11px]">
                                                        {getSourceDetails(id).name}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500 truncate">
                                                        {getSourceDetails(id).domain}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </span>
                                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#111111] border-r border-b border-white/10 rotate-45"></span>
                                </span>
                            </span>
                        )}
                    </span>
                </p>
            );
        },
        a: ({ node, ...props }: any) => (
            <a {...props} className="text-blue-600 hover:underline dark:text-blue-400" target="_blank" rel="noopener noreferrer" />
        ),
        img: ({ node, ...props }: any) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img {...props} className="my-4 rounded-xl w-full object-cover max-h-[500px]" alt={props.alt || ''} />
        ),
        blockquote: ({ node, ...props }: any) => (
            <blockquote {...props} className="border-l-4 border-black/20 pl-4 py-1 italic opacity-80 dark:border-white/20" />
        )
    };

    return (
        <div className={`prose max-w-none dark:prose-invert ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
