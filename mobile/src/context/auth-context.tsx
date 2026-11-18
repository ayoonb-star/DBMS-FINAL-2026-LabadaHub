import { createContext, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

export type AccountRole = 'client' | 'staff' | 'admin';

export type AccountUser = {
  name: string;
  email: string;
  role: AccountRole;
};

type Account = AccountUser & { password: string };
type Invite = { code: string; role: Exclude<AccountRole, 'client'> };

type AuthContextValue = {
  user: AccountUser | null;
  invites: Invite[];
  signIn: (email: string, password: string, role: AccountRole) => string | null;
  signUp: (details: {
    name: string;
    email: string;
    password: string;
    role: AccountRole;
    inviteCode: string;
  }) => string | null;
  createInvite: (role: Exclude<AccountRole, 'client'>) => string;
  signOut: () => void;
};

const DEMO_ADMIN: Account = {
  name: 'LabadaHub Admin',
  email: 'admin@freshstream.local',
  password: 'LaundryAdmin26!',
  role: 'admin',
};

const AuthContext = createContext<AuthContextValue | null>(null);
let localAccounts: Account[] = [DEMO_ADMIN];
let localInvites: Invite[] = [];
let currentUser: AccountUser | null = null;

export function AuthProvider({ children }: PropsWithChildren) {
  const [invites, setInvites] = useState(localInvites);
  const [user, setUser] = useState<AccountUser | null>(currentUser);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      invites,
      signIn: (email, password, role) => {
        const account = localAccounts.find(
          (item) =>
            item.email.toLowerCase() === email.trim().toLowerCase() &&
            item.password === password &&
            item.role === role,
        );
        if (!account) {
          return 'We could not find a matching account for that role. Check your details or sign up.';
        }
        currentUser = { name: account.name, email: account.email, role: account.role };
        setUser(currentUser);
        return null;
      },
      signUp: ({ name, email, password, role, inviteCode }) => {
        const normalizedEmail = email.trim().toLowerCase();
        if (localAccounts.some((account) => account.email.toLowerCase() === normalizedEmail)) {
          return 'An account already uses this email. Try signing in instead.';
        }
        const invite = role === 'client'
          ? null
          : localInvites.find((item) => item.code === inviteCode.trim().toUpperCase() && item.role === role);
        if (role !== 'client' && !invite) {
          return 'Enter a valid invitation code for this account type.';
        }

        const account: Account = { name: name.trim(), email: normalizedEmail, password, role };
        localAccounts = [...localAccounts, account];
        if (invite) {
          localInvites = localInvites.filter((item) => item.code !== invite.code);
          setInvites(localInvites);
        }
        currentUser = { name: account.name, email: account.email, role: account.role };
        setUser(currentUser);
        return null;
      },
      createInvite: (role) => {
        const code = `${role === 'admin' ? 'ADMIN' : 'STAFF'}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        localInvites = [...localInvites, { code, role }];
        setInvites(localInvites);
        return code;
      },
      signOut: () => {
        currentUser = null;
        setUser(null);
      },
    }),
    [invites, user],
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
