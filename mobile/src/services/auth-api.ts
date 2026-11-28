import type { AccountRole, AccountUser } from '@/types/auth';
import { apiClient } from './api-client';

export type AuthResult = {
  token: string;
  user: AccountUser;
};

type RegistrationDetails = {
  name: string;
  email: string;
  password: string;
  role: AccountRole;
  inviteCode: string;
};

type AdminApplicationDetails = {
  name: string;
  email: string;
  password: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseUser(value: unknown): AccountUser {
  if (!isRecord(value)) {
    throw new Error('The server returned an invalid user profile.');
  }

  const { id, name, email } = value;
  const role = value.role === 'customer' ? 'client' : value.role;
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    (role !== 'client' && role !== 'staff' && role !== 'admin')
  ) {
    throw new Error('The server returned an invalid user profile.');
  }

  return {
    id,
    name,
    email,
    role,
    phone: typeof value.phone === 'string' ? value.phone : null,
  };
}

function parseAuthResult(value: unknown): AuthResult {
  if (!isRecord(value) || typeof value.token !== 'string' || value.token.length === 0) {
    throw new Error('The server returned an invalid authentication response.');
  }

  return { token: value.token, user: parseUser(value.user) };
}

export async function register(details: RegistrationDetails): Promise<AuthResult> {
  if (details.role === 'admin') {
    throw new Error('Admin accounts must use the application approval flow.');
  }

  const response = await apiClient.post<unknown>('/auth/register', {
    name: details.name,
    email: details.email,
    password: details.password,
    role: details.role,
    ...(details.role === 'client' || !details.inviteCode.trim()
      ? {}
      : { inviteCode: details.inviteCode.trim() }),
  });
  return parseAuthResult(response.data);
}

export async function requestAdminApplication(details: AdminApplicationDetails): Promise<void> {
  const response = await apiClient.post<unknown>('/auth/admin-applications', {
    name: details.name,
    email: details.email.trim().toLowerCase(),
    password: details.password,
  });
  if (!isRecord(response.data) || typeof response.data.message !== 'string') {
    throw new Error('The server returned an invalid Admin application response.');
  }
}

export async function verifyAdminApplication(
  email: string,
  verificationCode: string,
): Promise<AuthResult> {
  const response = await apiClient.post<unknown>('/auth/admin-applications/verify', {
    email: email.trim().toLowerCase(),
    verificationCode: verificationCode.trim().toUpperCase(),
  });
  return parseAuthResult(response.data);
}

export async function resendAdminApplicationCode(email: string): Promise<void> {
  const response = await apiClient.post<unknown>('/auth/admin-applications/resend', {
    email: email.trim().toLowerCase(),
  });
  if (!isRecord(response.data) || typeof response.data.message !== 'string') {
    throw new Error('The server returned an invalid verification response.');
  }
}

export async function login(
  email: string,
  password: string,
  role: AccountRole,
): Promise<AuthResult> {
  const response = await apiClient.post<unknown>('/auth/login', { email, password, role });
  return parseAuthResult(response.data);
}

export async function getCurrentUser(token: string): Promise<AccountUser> {
  const response = await apiClient.get<unknown>('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!isRecord(response.data)) {
    throw new Error('The server returned an invalid user profile.');
  }
  return parseUser(response.data.user);
}

export async function createStaffInvite(
  token: string,
): Promise<string> {
  const response = await apiClient.post<unknown>(
    '/auth/invitations/staff',
    { role: 'staff' },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (
    !isRecord(response.data) ||
    response.data.role !== 'staff' ||
    typeof response.data.code !== 'string'
  ) {
    throw new Error('The server returned an invalid invitation.');
  }
  return response.data.code;
}

