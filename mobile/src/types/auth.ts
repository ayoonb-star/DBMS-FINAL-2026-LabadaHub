export type AccountRole = 'client' | 'staff' | 'admin';

export type AccountUser = {
  id: string | number;
  name: string;
  email: string;
  role: AccountRole;
  phone?: string | null;
};

export type StaffInvite = {
  code: string;
  role: 'staff';
};
