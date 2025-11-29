import React from 'react';
import type { ChatMessage as Msg } from '@/types/chat';

export default function ChatMessage({ message }: { message: Msg }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isUser ? (
        <div
          className="
            max-w-[78%] rounded-2xl bg-black px-4 py-2 text-sm text-white
            dark:bg-white dark:text-black
            break-words whitespace-pre-wrap
          "
        >
          {message.content}
        </div>
      ) : (
        <article
          className="
            prose prose-sm max-w-[78%]
            rounded-2xl border border-black/10 bg-white px-4 py-3
            dark:prose-invert dark:border-white/10 dark:bg-neutral-900
          "
        >
          {message.content.split('\n').map((p, i) => (
            <p
              key={i}
              className="m-0 break-words whitespace-pre-wrap"
            >
              {p}
            </p>
          ))}
        </article>
      )}
    </div>
  );
}
