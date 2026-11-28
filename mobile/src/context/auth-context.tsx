import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  createStaffInvite as createStaffInviteRequest,
  getCurrentUser,
  login,
  requestAdminApplication as requestAdminApplicationRequest,
  resendAdminApplicationCode as resendAdminApplicationCodeRequest,
  register,
  verifyAdminApplication as verifyAdminApplicationRequest,
} from '@/services/auth-api';
import {
  getApiErrorMessage,
  isUnauthorizedApiError,
} from '@/services/api-client';
import {
  clearStoredAuthToken,
  getStoredAuthToken,
  storeAuthToken,
} from '../services/auth-token-storage';
import type { AccountRole, AccountUser, StaffInvite } from '@/types/auth';

export type { AccountRole, AccountUser } from '@/types/auth';

type AuthContextValue = {
  user: AccountUser | null;
  invites: StaffInvite[];
  isRestoringSession: boolean;
  authError: string | null;
  signIn: (email: string, password: string, role: AccountRole) => Promise<string | null>;
  signUp: (details: {
    name: string;
    email: string;
    password: string;
    role: AccountRole;
    inviteCode: string;
  }) => Promise<string | null>;
  requestAdminApplication: (details: {
    name: string;
    email: string;
    password: string;
  }) => Promise<string | null>;
  verifyAdminApplication: (email: string, verificationCode: string) => Promise<string | null>;
  resendAdminApplicationCode: (email: string) => Promise<string | null>;
  createStaffInvite: () => Promise<string>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const storedToken = await getStoredAuthToken();
        if (!active || !storedToken) {
          return;
        }

        setToken(storedToken);
        try {
          const currentUser = await getCurrentUser(storedToken);
          if (active) {
            setUser(currentUser);
          }
        } catch (error) {
          if (isUnauthorizedApiError(error)) {
            await clearStoredAuthToken();
            if (active) {
              setToken(null);
              setAuthError('Your session expired. Please sign in again.');
            }
          } else if (active) {
            setAuthError(getApiErrorMessage(error));
          }
        }
      } catch (error) {
        if (active) {
          setAuthError(getApiErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsRestoringSession(false);
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      invites,
      isRestoringSession,
      authError,
      signIn: async (email, password, role) => {
        setAuthError(null);
        try {
          const result = await login(email.trim(), password, role);
          await storeAuthToken(result.token);
          setToken(result.token);
          setUser(result.user);
          return null;
        } catch (error) {
          return getApiErrorMessage(error);
        }
      },
      signUp: async (details) => {
        setAuthError(null);
        try {
          const result = await register({
            ...details,
            name: details.name.trim(),
            email: details.email.trim(),
          });
          await storeAuthToken(result.token);
          setToken(result.token);
          setUser(result.user);
          if (details.inviteCode.trim()) {
            const redeemedCode = details.inviteCode.trim().toUpperCase();
            setInvites((current) =>
              current.filter((invite) => invite.code !== redeemedCode),
            );
          }
          return null;
        } catch (error) {
          return getApiErrorMessage(error);
        }
      },
      requestAdminApplication: async (details) => {
        setAuthError(null);
        try {
          await requestAdminApplicationRequest({
            ...details,
            name: details.name.trim(),
            email: details.email.trim(),
          });
          return null;
        } catch (error) {
          return getApiErrorMessage(error);
        }
      },
      verifyAdminApplication: async (email, verificationCode) => {
        setAuthError(null);
        try {
          const result = await verifyAdminApplicationRequest(email.trim(), verificationCode);
          await storeAuthToken(result.token);
          setToken(result.token);
          setUser(result.user);
          return null;
        } catch (error) {
          return getApiErrorMessage(error);
        }
      },
      resendAdminApplicationCode: async (email) => {
        setAuthError(null);
        try {
          await resendAdminApplicationCodeRequest(email.trim());
          return null;
        } catch (error) {
          return getApiErrorMessage(error);
        }
      },
      createStaffInvite: async () => {
        if (!token) {
          throw new Error('Sign in as an administrator to create invitations.');
        }

        const code = await createStaffInviteRequest(token);
        setInvites((current) => [...current, { code, role: 'staff' }]);
        return code;
      },
      signOut: async () => {
        await clearStoredAuthToken();
        setToken(null);
        setUser(null);
        setAuthError(null);
      },
    }),
    [authError, invites, isRestoringSession, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
