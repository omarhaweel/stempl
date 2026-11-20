import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { Brand } from '@/constants/brand';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Shared look of the bottom taskbar: white bar with rounded top corners, teal when active. */
export const tabBarScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: Brand.blue,
  tabBarInactiveTintColor: '#A9BAB9',
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const },
  tabBarStyle: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    boxShadow: '0px -6px 24px rgba(15,95,90,0.10)',
  },
};

/** Options for one tab: label plus an outline/filled icon pair. */
export function tab(title: string, icon: IconName, activeIcon: IconName) {
  return {
    title,
    tabBarIcon: ({ focused, size }: { focused: boolean; color: ColorValue; size: number }) => (
      <Ionicons name={focused ? activeIcon : icon} size={size} color={focused ? Brand.blue : '#A9BAB9'} />
    ),
  };
}
