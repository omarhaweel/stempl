import { Stack } from 'expo-router';

/** Administrator: the tabs (Brukere, Dagsplan) and the detail pages that open on top of them. */
export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
