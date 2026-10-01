import type { PublicProfile } from '../src/shared/world';
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  profile: PublicProfile;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response
    .json()
    .catch(() => ({ message: 'サーバーからの応答を確認できませんでした' }));
  if (!response.ok)
    throw new ApiError(
      Array.isArray(data.message)
        ? '入力内容を確認してください（パスワードは10文字以上）'
        : data.message || '処理に失敗しました',
      response.status,
    );
  return data as T;
}
export const errorText = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof Error &&
    ['TimeoutError', 'AbortError'].includes(error.name))
    ? '接続できませんでした。ネットワークを確認して、もう一度お試しください'
    : error instanceof Error
      ? error.message
      : '接続を確認して、もう一度お試しください';
