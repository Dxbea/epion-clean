import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';

export type ChatFolder = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchFolders(): Promise<ChatFolder[]> {
  const res = await fetch(`${API_BASE}/api/chat/folders`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function createFolder(name: string): Promise<ChatFolder> {
  const res = await fetch(`${API_BASE}/api/chat/folders`, await withCsrf({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  }));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function renameFolder(id: string, name: string): Promise<ChatFolder> {
  const res = await fetch(`${API_BASE}/api/chat/folders/${id}`, await withCsrf({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  }));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function deleteFolder(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/folders/${id}`, await withCsrf({
    method: 'DELETE',
  }));
  if (!res.ok) throw new Error('HTTP ' + res.status);
}
