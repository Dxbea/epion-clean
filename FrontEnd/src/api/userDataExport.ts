import { API_BASE } from '@/config/api';

function filenameFromContentDisposition(value: string | null) {
  const match = value?.match(/filename="?([^"]+)"?/i);
  return match?.[1] || null;
}

export async function downloadUserDataExport() {
  const response = await fetch(`${API_BASE}/api/me/export`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
    },
  });

  if (!response.ok) {
    const error: any = new Error(response.status === 401 ? 'UNAUTHENTICATED' : `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  const filename =
    filenameFromContentDisposition(response.headers.get('content-disposition')) ||
    `epion-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
