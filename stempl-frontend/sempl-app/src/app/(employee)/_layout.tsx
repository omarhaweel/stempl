import { Stack } from 'expo-router';

/** Employee: the tabs (Hjem, Dagsplan) and the overview pages that open on top of them. */
export default function EmployeeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
