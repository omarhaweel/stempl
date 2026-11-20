import { Stack } from 'expo-router';

// No screen transition animation on the login page.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
