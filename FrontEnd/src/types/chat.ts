// Basic chat types shared by the chat UI

export type Role = 'user' | 'assistant';

export interface Message {
  id: string;          // uuid
  role: Role;          // 'user' | 'assistant'
  content: string;     // plain text/markdown
  createdAt: number;   // Date.now()
}

export interface Conversation {
  id: string;          // uuid
  title: string;       // first user message or custom title
  messages: Message[];
   // chronological
  // Optional fields you can add later:
  // folderId?: string;
  // pinned?: boolean;
}
export type ChatMessage = {
    id: string;
    role: string;
    content: string;
    createdAt: number;
};

