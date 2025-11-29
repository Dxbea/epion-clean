import axios from 'axios';

export type ChatFolder = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchFolders(): Promise<ChatFolder[]> {
  // 👉 URL correcte côté back
  const { data } = await axios.get('/api/chat/folders');
  return data;
}

export async function createFolder(name: string): Promise<ChatFolder> {
  const { data } = await axios.post('/api/chat/folders', { name });
  return data;
}

export async function renameFolder(id: string, name: string): Promise<ChatFolder> {
  const { data } = await axios.patch(`/api/chat/folders/${id}`, { name });
  return data;
}

export async function deleteFolder(id: string): Promise<void> {
  await axios.delete(`/api/chat/folders/${id}`);
}
