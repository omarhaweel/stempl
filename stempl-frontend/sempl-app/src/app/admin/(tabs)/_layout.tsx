import { Tabs } from 'expo-router';

import { tab, tabBarScreenOptions } from '@/components/tab-options';
import { usePollUnreadPlans, useUnreadPlans } from '@/lib/unread-plans';

/** Administrator: bottom taskbar with Brukere and Dagsplan (number = unread comments). */
export default function AdminTabs() {
  usePollUnreadPlans('admin');
  const unread = useUnreadPlans();

  return (
    <Tabs screenOptions={tabBarScreenOptions}>
      <Tabs.Screen name="index" options={tab('Brukere', 'people-outline', 'people')} />
      <Tabs.Screen
        name="dagsplan"
        options={{ ...tab('Dagsplan', 'calendar-outline', 'calendar'), tabBarBadge: unread > 0 ? unread : undefined }}
      />
    </Tabs>
  );
}
