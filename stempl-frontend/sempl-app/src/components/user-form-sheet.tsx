import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorBanner, Field, PrimaryButton } from '@/components/form';
import { Sheet } from '@/components/ui';
import { Brand } from '@/constants/brand';
import type { AdminUser } from '@/lib/admin-types';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/authed';
import { formatDateInput, isoToDateInput, toIsoDate } from '@/lib/date-input';

type Props = {
  visible: boolean;
  /** Pass a user to edit; omit to add a new one. */
  user?: AdminUser;
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
};

// Mounted fresh each time it opens (see `key` below) so the form starts clean.
export function UserFormSheet(props: Props) {
  return <Inner key={`${props.visible}-${props.user?.id ?? 'new'}`} {...props} />;
}

function Inner({ visible, user, onClose, onSaved }: Props) {
  const editing = !!user;
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    dateOfBirth: isoToDateInput(user?.dateOfBirth),
    password: '',
  });
  const [role, setRole] = useState<'customer' | 'professional'>('customer');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    const local: Record<string, string> = {};
    if (!form.firstName.trim()) local.firstName = 'Påkrevd';
    if (!form.lastName.trim()) local.lastName = 'Påkrevd';
    if (!form.email.trim()) local.email = 'Påkrevd';
    if (!editing && !form.password) local.password = 'Påkrevd';
    const isoDate = form.dateOfBirth ? toIsoDate(form.dateOfBirth, { pastOnly: true }) : null;
    if (form.dateOfBirth && !isoDate) local.dateOfBirth = 'Bruk formatet dd-mm-åååå';
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;

    setLoading(true);
    try {
      const common = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dateOfBirth: isoDate ?? '',
      };
      const res = editing
        ? await authed<{ user: AdminUser }>(`/admin/users/${user.id}`, { method: 'PATCH', body: common })
        : await authed<{ user: AdminUser }>('/admin/users', {
            body: { ...common, phone: common.phone || undefined, dateOfBirth: common.dateOfBirth || undefined, password: form.password, role },
          });
      onSaved(res.user);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors);
        setFormError(Object.keys(e.fieldErrors).length ? null : e.message);
      } else {
        setFormError('Noe gikk galt. Prøv igjen.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet visible={visible} title={editing ? 'Rediger bruker' : 'Ny bruker'} onClose={onClose}>
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Fornavn" value={form.firstName} onChangeText={set('firstName')} error={errors.firstName} />
        </View>
        <View style={styles.half}>
          <Field label="Etternavn" value={form.lastName} onChangeText={set('lastName')} error={errors.lastName} />
        </View>
      </View>
      <Field label="E-post" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" error={errors.email} />
      <Field label="Telefon (valgfritt)" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={errors.phone} />
      <Field
        label="Fødselsdato (valgfritt)"
        value={form.dateOfBirth}
        onChangeText={(v) => set('dateOfBirth')(formatDateInput(v))}
        keyboardType="number-pad"
        maxLength={10}
        placeholder="dd-mm-åååå"
        error={errors.dateOfBirth}
      />

      {!editing && (
        <>
          <View style={styles.roleBlock}>
            <Text style={styles.roleLabel}>Rolle</Text>
            <View style={styles.roleRow}>
              {(['customer', 'professional'] as const).map((r) => {
                const active = role === r;
                return (
                  <Pressable key={r} onPress={() => setRole(r)} style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
                    <Text style={[styles.chipText, { color: active ? '#ffffff' : Brand.ink }]}>
                      {r === 'customer' ? 'Kunde' : 'Fagperson'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Field
            label="Startpassord"
            value={form.password}
            onChangeText={set('password')}
            secureTextEntry
            placeholder="Minst 8 tegn, store/små bokstaver og tall"
            error={errors.password}
          />
        </>
      )}

      {formError ? <ErrorBanner message={formError} /> : null}
      <PrimaryButton title={editing ? 'Lagre' : 'Opprett bruker'} onPress={submit} loading={loading} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  roleBlock: { gap: 6 },
  roleLabel: { fontSize: 14, fontWeight: '700', color: Brand.ink },
  roleRow: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 999, borderWidth: 1.5 },
  chipActive: { backgroundColor: Brand.blue, borderColor: Brand.blue },
  chipIdle: { backgroundColor: Brand.field, borderColor: Brand.fieldBorder },
  chipText: { fontWeight: '700', fontSize: 15 },
});
