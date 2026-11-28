import { create, isAxiosError } from 'axios';

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const defaultApiBaseUrl = 'http://localhost:5000/api/v1';
const configuredBase = (configuredApiBaseUrl || defaultApiBaseUrl).replace(/\/+$/, '');

export const API_BASE_URL = configuredBase.endsWith('/api/v1')
  ? configuredBase
  : `${configuredBase}/api/v1`;

export const apiClient = create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getApiErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const responseData: unknown = error.response?.data;
    if (isRecord(responseData)) {
      if (typeof responseData.message === 'string') {
        return responseData.message;
      }
      if (isRecord(responseData.error) && typeof responseData.error.message === 'string') {
        return responseData.error.message;
      }
    }

    if (error.code === 'ECONNABORTED') {
      return 'The server took too long to respond. Please try again.';
    }
    if (!error.response) {
      return 'Cannot reach LabadaHub. Check the API URL and your network connection.';
    }
    return `The request failed (${error.response.status}). Please try again.`;
  }

  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

export function isUnauthorizedApiError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 401;
}
