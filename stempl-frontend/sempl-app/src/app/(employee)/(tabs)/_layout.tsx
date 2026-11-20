import { Tabs } from 'expo-router';

import { tab, tabBarScreenOptions } from '@/components/tab-options';
import { usePollUnreadPlans, useUnreadPlans } from '@/lib/unread-plans';

/** Employee: bottom taskbar with Hjem and Dagsplan (with unread number). */
export default function EmployeeTabs() {
  usePollUnreadPlans('employee');
  const unread = useUnreadPlans();

  return (
    <Tabs screenOptions={tabBarScreenOptions}>
      <Tabs.Screen name="home" options={tab('Hjem', 'time-outline', 'time')} />
      <Tabs.Screen
        name="dagsplan"
        options={{ ...tab('Se dagsplan', 'calendar-outline', 'calendar'), tabBarBadge: unread > 0 ? unread : undefined }}
      />
    </Tabs>
  );
}
