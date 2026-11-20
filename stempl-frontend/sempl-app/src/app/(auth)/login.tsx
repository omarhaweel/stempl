import { useState } from 'react';

import { AuthShell, ErrorBanner, Field, PrimaryButton } from '@/components/form';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return setError('Skriv inn e-post og passord');
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt. Prøv igjen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Velkommen tilbake" subtitle="Logg inn for å fortsette">
      {error ? <ErrorBanner message={error} /> : null}
      <Field
        label="E-post"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="navn@eksempel.no"
      />
      <Field
        label="Passord"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        placeholder="Ditt passord"
        onSubmitEditing={submit}
      />

      <PrimaryButton title="Logg inn" onPress={submit} loading={loading} />
    </AuthShell>
  );
}
