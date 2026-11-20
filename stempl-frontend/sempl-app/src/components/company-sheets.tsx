import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ErrorBanner, Field, PrimaryButton } from '@/components/form';
import { Sheet } from '@/components/ui';
import { Brand } from '@/constants/brand';
import type { Company } from '@/lib/admin-types';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/authed';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Noe gikk galt. Prøv igjen.');

/** Add a company by organisasjonsnummer; the name is fetched from Brønnøysundregistrene. */
export function AddCompanySheet(props: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  return <AddCompanyInner key={String(props.visible)} {...props} />;
}

function AddCompanyInner({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [org, setOrg] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Look the number up as soon as all 9 digits are entered.
  useEffect(() => {
    if (org.length !== 9) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLooking(true);
      try {
        const res = await authed<{ name: string }>(`/super/lookup/${org}`);
        if (!cancelled) {
          setName(res.name);
          setLookupError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setName(null);
          setLookupError(errorText(e));
        }
      } finally {
        if (!cancelled) setLooking(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [org]);

  function change(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 9);
    setOrg(digits);
    if (digits.length !== 9) {
      setName(null);
      setLookupError(null);
    }
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await authed('/super/companies', { body: { orgNumber: org } });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={visible} title="Legg til selskap" onClose={onClose}>
      <Field
        label="Organisasjonsnummer"
        value={org}
        onChangeText={change}
        keyboardType="number-pad"
        maxLength={9}
        placeholder="9 siffer"
        error={lookupError ?? undefined}
      />
      {looking ? <Text style={styles.muted}>Søker i Brønnøysundregistrene …</Text> : null}
      {name ? (
        <View style={styles.found}>
          <Ionicons name="checkmark-circle" size={22} color={Brand.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.foundName}>{name}</Text>
            <Text style={styles.muted}>Funnet i Enhetsregisteret</Text>
          </View>
        </View>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {name ? <PrimaryButton title="Legg til selskap" onPress={save} loading={saving} variant="success" /> : null}
    </Sheet>
  );
}

/** Add the first (or another) administrator for a company. */
export function AddAdminSheet(props: { company: Company | null; onClose: () => void; onCreated: () => void }) {
  return <AddAdminInner key={props.company?.id ?? 'none'} {...props} />;
}

function AddAdminInner({ company, onClose, onCreated }: { company: Company | null; onClose: () => void; onCreated: () => void }) {
  const [created, setCreated] = useState<string | null>(null); // email of the administrator just created
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    if (!company) return;
    const local: Record<string, string> = {};
    if (!form.firstName.trim()) local.firstName = 'Påkrevd';
    if (!form.lastName.trim()) local.lastName = 'Påkrevd';
    if (!form.email.trim()) local.email = 'Påkrevd';
    if (!form.password) local.password = 'Påkrevd';
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;

    setLoading(true);
    try {
      await authed(`/super/companies/${company.id}/admins`, {
        body: { ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim() },
      });
      setCreated(form.email.trim().toLowerCase());
      onCreated();
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
    <Sheet visible={!!company} title="Ny administrator" onClose={onClose}>
      <View style={styles.found}>
        <Ionicons name="business-outline" size={22} color={Brand.green} />
        <View style={{ flex: 1 }}>
          <Text style={styles.foundName}>{company?.name}</Text>
          <Text style={styles.muted}>Organisasjonsnummer: {company?.orgNumber}</Text>
        </View>
      </View>
      {created ? (
        <>
          <View style={styles.found}>
            <Ionicons name="checkmark-circle" size={22} color={Brand.green} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.foundName}>Administrator opprettet</Text>
              <Text style={styles.muted}>Organisasjonsnummer: {company?.orgNumber}</Text>
              <Text style={styles.muted}>E-post: {created}</Text>
            </View>
          </View>
          <Text style={styles.muted}>
            Gi administratoren e-posten og passordet du valgte. Administratoren logger inn med bare e-post og passord, og er
            knyttet til dette organisasjonsnummeret. Brukerne hen legger til logger inn på samme måte og tilhører samme
            selskap.
          </Text>
          <PrimaryButton title="Ferdig" onPress={onClose} />
        </>
      ) : (
        <>
          <View style={styles.row}>
            <View style={styles.half}>
              <Field label="Fornavn" value={form.firstName} onChangeText={set('firstName')} error={errors.firstName} />
            </View>
            <View style={styles.half}>
              <Field label="Etternavn" value={form.lastName} onChangeText={set('lastName')} error={errors.lastName} />
            </View>
          </View>
          <Field label="E-post" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" error={errors.email} />
          <Field label="Passord" value={form.password} onChangeText={set('password')} secureTextEntry error={errors.password} />
          {formError ? <ErrorBanner message={formError} /> : null}
          <PrimaryButton title="Opprett administrator" onPress={submit} loading={loading} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  muted: { color: Brand.muted, fontSize: 14 },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Brand.greenSoft,
  },
  foundName: { color: Brand.ink, fontWeight: '800', fontSize: 16 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
