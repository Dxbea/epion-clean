import axios from 'axios';

import { API_BASE } from '@/config/api';

export type ChatFolder = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchFolders(): Promise<ChatFolder[]> {
  // 👉 URL correcte côté back
  const { data } = await axios.get(`${API_BASE}/api/chat/folders`, { withCredentials: true });
  return data;
}

export async function createFolder(name: string): Promise<ChatFolder> {
  const { data } = await axios.post(`${API_BASE}/api/chat/folders`, { name }, { withCredentials: true });
  return data;
}

export async function renameFolder(id: string, name: string): Promise<ChatFolder> {
  const { data } = await axios.patch(`${API_BASE}/api/chat/folders/${id}`, { name }, { withCredentials: true });
  return data;
}

export async function deleteFolder(id: string): Promise<void> {
  await axios.delete(`${API_BASE}/api/chat/folders/${id}`, { withCredentials: true });
}
