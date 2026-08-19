// Backend API client (dev traffic is proxied to the backend via Vite).
export interface UserInfo {
  id: number;
  name: string;
  dev: boolean;
  avatar?: string | null;
}

async function jsonFetch(path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

export const api = {
  get: (path: string) => jsonFetch(path),
  post: (path: string, body: unknown) =>
    jsonFetch(path, { method: 'POST', body: JSON.stringify(body) }),
};

export async function fetchUser(): Promise<UserInfo | null> {
  try {
    const { status, data } = await api.get('/auth/me');
    return status === 200 ? (data.user as UserInfo) : null;
  } catch {
    // 网络异常时按未登录处理 (调用方无需再捕获)
    return null;
  }
}

/** Open the WebSocket for a combat room. */
export function openRoomWs(roomId: string): WebSocket {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return new WebSocket(`${proto}://${location.host}/ws/combat/room/${roomId}`);
}

export const loginUrl = '/auth/github';
