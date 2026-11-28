import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_KEY = 'labadahub.auth.token';

export function getStoredAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

export function storeAuthToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

export function clearStoredAuthToken(): Promise<void> {
  return SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}
