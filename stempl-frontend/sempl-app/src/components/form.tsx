import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Backdrop } from '@/components/backdrop';
import { Logo } from '@/components/logo';
import { Brand } from '@/constants/brand';

/** Light page with soft color blobs and a see-through card, shared by login and register. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.shell}>
      <Backdrop />
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Logo size={84} />
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <View style={styles.card}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string };

export function Field({ label, error, secureTextEntry, style, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isPassword = !!secureTextEntry;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputFocused, !!error && styles.inputError]}>
        <TextInput
          placeholderTextColor="#94A3B8"
          style={[styles.input, style]}
          secureTextEntry={isPassword && hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {isPassword && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={12}
            accessibilityLabel={hidden ? 'Vis passord' : 'Skjul passord'}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={22} color={Brand.muted} />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
}) {
  const secondary = variant === 'secondary';
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'success' && styles.buttonSuccess,
        pressed && (variant === 'primary' ? styles.buttonPressed : styles.buttonPressedSoft),
        loading && styles.buttonLoading,
      ]}>
      {loading ? (
        <ActivityIndicator color={secondary ? Brand.blue : '#ffffff'} />
      ) : (
        <Text style={[styles.buttonText, secondary && { color: Brand.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shell: { flex: 1, overflow: 'hidden', backgroundColor: Brand.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 32,
    gap: 22,
  },
  header: { alignItems: 'center', gap: 14 },
  title: { fontSize: 30, fontWeight: '800', color: Brand.ink, textAlign: 'center' },
  subtitle: { fontSize: 16, color: Brand.muted, textAlign: 'center' },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 28,
    padding: 24,
    gap: 16,
    backgroundColor: Brand.glass,
    borderWidth: 1,
    borderColor: Brand.glassBorder,
    boxShadow: Brand.shadow,
  },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: Brand.ink },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Brand.fieldBorder,
    backgroundColor: Brand.field,
    paddingHorizontal: 16,
  },
  inputFocused: { borderColor: Brand.blue },
  inputError: { borderColor: Brand.error },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: Brand.ink,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  error: { color: Brand.error, fontSize: 13 },
  button: {
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: Brand.blue,
    boxShadow: Brand.shadowOrange,
  },
  buttonPressed: { backgroundColor: Brand.blueDark },
  buttonSecondary: { backgroundColor: Brand.field, borderWidth: 1.5, borderColor: Brand.fieldBorder, boxShadow: 'none' },
  buttonDanger: { backgroundColor: Brand.error, boxShadow: '0px 8px 20px rgba(229,72,77,0.3)' },
  buttonSuccess: { backgroundColor: Brand.green, boxShadow: '0px 8px 20px rgba(47,163,107,0.3)' },
  buttonPressedSoft: { opacity: 0.7 },
  buttonLoading: { opacity: 0.7 },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  banner: { backgroundColor: Brand.coralTint, borderRadius: 14, padding: 12 },
  bannerText: { color: Brand.error, textAlign: 'center', fontWeight: '600' },
});
