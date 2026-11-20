import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/lib/auth-context';

// Always-reachable entry point: sends users to the right place.
export default function Index() {
  const { user } = useAuth();
  const target = !user ? '/login' : user.role === 'super_admin' ? '/super' : user.role === 'admin' ? '/admin' : '/home';
  return <Redirect href={target as Href} />;
}
