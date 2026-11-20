import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Brand } from '@/constants/brand';
import { ApiError } from '@/lib/api';
import type { PlanComment } from '@/lib/dagsplan';
import { formatClock } from '@/lib/time';

const dayText = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Comments on a dagsplan, with a box to write a new one. Used by employees and administrators. */
export function CommentThread({
  comments,
  onSend,
  placeholder = 'Skriv en kommentar…',
}: {
  comments: PlanComment[];
  onSend: (body: string) => Promise<void>;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body);
      setText('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {comments.length > 0 ? <Text style={styles.title}>Kommentarer</Text> : null}
      {comments.map((c) => {
        const at = new Date(c.createdAt);
        return (
          <View key={c.id} style={[styles.row, c.mine && styles.rowMine]}>
            <View style={[styles.bubble, c.mine ? styles.bubbleMine : styles.bubbleOther]}>
              <Text style={styles.author}>
                {c.mine ? 'Du' : c.fromAdmin ? `${c.authorName} (admin)` : c.authorName}
                {!c.mine && !c.read ? '  ·  Ny' : ''}
              </Text>
              <Text style={styles.body}>{c.body}</Text>
              <Text style={styles.time}>
                {dayText(at)} kl. {formatClock(at)}
              </Text>
            </View>
          </View>
        );
      })}

      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={1000}
          style={styles.input}
        />
        <Pressable
          onPress={send}
          disabled={busy || !text.trim()}
          accessibilityLabel="Send kommentar"
          style={[styles.send, (!text.trim() || busy) && { opacity: 0.45 }]}>
          {busy ? <ActivityIndicator color="#ffffff" /> : <Ionicons name="send" size={18} color="#ffffff" />}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 8, marginTop: 4 },
  title: { fontSize: 14, fontWeight: '800', color: Brand.ink },
  row: { flexDirection: 'row', justifyContent: 'flex-start' },
  rowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
  bubbleMine: { backgroundColor: 'rgba(23,147,141,0.14)' },
  bubbleOther: { backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: Brand.fieldBorder },
  author: { fontSize: 12, fontWeight: '800', color: Brand.muted },
  body: { fontSize: 15, color: Brand.ink, lineHeight: 21 },
  time: { fontSize: 11, color: Brand.muted, alignSelf: 'flex-end' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Brand.fieldBorder,
    backgroundColor: Brand.field,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Brand.ink,
    ...(process.env.EXPO_OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.blue },
  error: { color: Brand.error, fontSize: 13 },
});
