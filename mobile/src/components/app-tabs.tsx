import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useEffect } from 'react';

import { useAuth } from '@/context/auth-context';

export default function AppTabs() {
  const { user } = useAuth();
  const role = user?.role ?? 'client';

  useEffect(() => {
    if (user) {
      router.replace(user.role === 'client' ? '/' : user.role === 'staff' ? '/staff' : '/admin');
    }
  }, [user, role]);

  return (
    <NativeTabs
      backgroundColor="#ffffff"
      indicatorColor="#e8f4fb"
      tintColor="#07577c"
      labelStyle={{ selected: { color: '#07577c' } }}>
      {role === 'client' ? (
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Book</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ) : null}
      <NativeTabs.Trigger name="orders">
        <NativeTabs.Trigger.Label>Orders</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {role !== 'client' ? (
        <NativeTabs.Trigger name="staff">
          <NativeTabs.Trigger.Label>Staff</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ) : null}
      {role === 'admin' ? (
        <NativeTabs.Trigger name="admin">
          <NativeTabs.Trigger.Label>Admin</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ) : null}
    </NativeTabs>
  );
}
