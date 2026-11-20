import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Backdrop } from '@/components/backdrop';
import { ErrorBanner, PrimaryButton } from '@/components/form';
import { Brand } from '@/constants/brand';

/** Mint page with soft circles, a centered column and a scroll view. */
export function Screen({
  children,
  refreshControl,
  wide,
}: {
  children: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Wider column for pages with a map or other large content. */
  wide?: boolean;
}) {
  return (
    <View style={styles.page}>
      <Backdrop />
      <SafeAreaView style={[styles.safe, wide && { maxWidth: 1040 }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** White rounded card with a soft shadow. */
export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Round white button with an icon (like the refresh button in the reference). */
export function IconButton({ icon, onPress, label, color = Brand.ink }: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={styles.iconBtn} hitSlop={8}>
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

type Tone = 'blue' | 'orange' | 'red' | 'green';
const TONES: Record<Tone, { fg: string; bg: string }> = {
  blue: { fg: Brand.blue, bg: Brand.blueTint },
  orange: { fg: Brand.orangeDark, bg: Brand.orangeSoft },
  red: { fg: Brand.error, bg: Brand.coralSoft },
  green: { fg: Brand.greenDark, bg: Brand.greenSoft },
};

/** Small tinted pill button (like the filter chips in the reference). */
export function SmallButton({
  title,
  onPress,
  icon,
  tone = 'blue',
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  tone?: Tone;
}) {
  const { fg, bg } = TONES[tone];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.small, { backgroundColor: bg }, pressed && { opacity: 0.7 }]}>
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={[styles.smallText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

/** Two-way (or more) switch: the chosen option is solid teal, the others are light. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segment, on && styles.segmentOn]} accessibilityLabel={o.label}>
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const KPI_TONES = {
  teal: { bg: Brand.blueSoft, icon: Brand.blueDark, badge: Brand.blue },
  amber: { bg: Brand.orangeTint, icon: Brand.orangeDark, badge: Brand.orangeDark },
  coral: { bg: Brand.coralTint, icon: Brand.coral, badge: Brand.coral },
};

/** Tinted KPI card: icon, label and the value in a solid badge (like "Activity KPI" in the reference). */
export function KpiCard({
  icon,
  label,
  value,
  tone = 'teal',
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone?: keyof typeof KPI_TONES;
  onPress?: () => void;
}) {
  const t = KPI_TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={onPress ? `Vis registreringer: ${label}` : label}
      style={({ pressed }) => [styles.kpi, { backgroundColor: t.bg }, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={26} color={t.icon} />
      <Text style={styles.kpiLabel}>{label}</Text>
      <View style={[styles.kpiBadge, { backgroundColor: t.badge }]}>
        <Text style={styles.kpiValue}>{value}</Text>
      </View>
    </Pressable>
  );
}

/** Centered dialog over a dimmed backdrop. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <IconButton icon="close" onPress={onClose} label="Lukk" />
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onCancel}>
      <Text style={styles.message}>{message}</Text>
      {error ? <ErrorBanner message={error} /> : null}
      <PrimaryButton title={confirmLabel} onPress={onConfirm} loading={busy} variant="danger" />
      <PrimaryButton title="Avbryt" onPress={onCancel} variant="secondary" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Brand.bg, overflow: 'hidden' },
  safe: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  scroll: { padding: 20, gap: 16 },
  card: {
    borderRadius: 22,
    padding: 18,
    gap: 10,
    backgroundColor: Brand.card,
    borderWidth: 1,
    borderColor: Brand.glassBorder,
    boxShadow: Brand.shadow,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 4px 14px rgba(15,95,90,0.10)',
  },
  small: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  smallText: { fontWeight: '700', fontSize: 14 },
  segmented: { flexDirection: 'row', borderRadius: 16, padding: 4, backgroundColor: Brand.blueSoft },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  segmentOn: { backgroundColor: Brand.blue, boxShadow: '0px 4px 12px rgba(23,147,141,0.35)' },
  segmentText: { fontSize: 15, fontWeight: '700', color: '#6E8E8C' },
  segmentTextOn: { color: '#FFFFFF' },
  kpi: {
    minWidth: 112,
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  kpiLabel: { fontSize: 12, fontWeight: '600', color: Brand.ink, textAlign: 'center' },
  kpiBadge: { minWidth: 56, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' },
  kpiValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(15,40,40,0.4)' },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    boxShadow: '0px 20px 50px rgba(15,60,58,0.25)',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: Brand.ink, flex: 1 },
  sheetBody: { padding: 20, paddingTop: 8, gap: 14 },
  message: { color: Brand.ink, fontSize: 16, lineHeight: 22 },
});
