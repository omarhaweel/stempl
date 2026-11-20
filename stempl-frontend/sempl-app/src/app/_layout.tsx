import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={user?.role === 'customer' || user?.role === 'professional'}>
        <Stack.Screen name="(employee)" />
      </Stack.Protected>
      <Stack.Protected guard={user?.role === 'admin'}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
      <Stack.Protected guard={user?.role === 'super_admin'}>
        <Stack.Screen name="super" />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </ThemeProvider>
  );
}
