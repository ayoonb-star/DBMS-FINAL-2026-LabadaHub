const AUTH_TOKEN_KEY = 'labadahub.auth.token';

function getLocalStorage(): Storage {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Browser storage is unavailable.');
  }
  return window.localStorage;
}

export async function getStoredAuthToken(): Promise<string | null> {
  return getLocalStorage().getItem(AUTH_TOKEN_KEY);
}

export async function storeAuthToken(token: string): Promise<void> {
  getLocalStorage().setItem(AUTH_TOKEN_KEY, token);
}

export async function clearStoredAuthToken(): Promise<void> {
  getLocalStorage().removeItem(AUTH_TOKEN_KEY);
}
