'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, ButtonLink, Card, Textarea } from '@/components/ui';
import styles from './support-assistant.module.css';

type Message = { role: 'user' | 'assistant'; content: string };
type Suggestion = { label: string; route: string };
type ChatError = { message: string; signIn?: boolean };
const MAX_MESSAGE = 240;
const MAX_HISTORY = 6;

function responseError(status: number): ChatError {
  if (status === 401) return { message: 'سجّل الدخول لاستخدام مساعد تحدّي.', signIn: true };
  if (status === 429) return { message: 'وصلت إلى حد الأسئلة مؤقتًا. انتظر قليلًا ثم أعد المحاولة.' };
  if (status === 503) return { message: 'المساعد غير متاح حاليًا. حاول لاحقًا أو استخدم روابط المساعدة أدناه.' };
  return { message: 'تعذّر الحصول على إجابة. أعد المحاولة بعد قليل.' };
}

function safeSuggestions(value: unknown): Suggestion[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Suggestion => (
    typeof item?.label === 'string' && item.label.length > 0 && item.label.length <= 40 &&
    typeof item?.route === 'string' && /^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(item.route)
  )).slice(0, 3);
}

export function SupportAssistant() {
  const headingId = useId();
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || content.length > MAX_MESSAGE || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 45_000);
    const history: Message[] = [...messages.slice(-MAX_HISTORY), { role: 'user', content }];
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const response = await fetch('/api/ai/lobby/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'المساعدة في استخدام تحدّي',
          messages: history.map((message) => ({ ...message, content: message.content.slice(0, MAX_MESSAGE) })),
        }),
        signal: controller.signal,
      });
      if (!mounted.current) return;
      if (!response.ok) {
        setError(responseError(response.status));
        return;
      }
      const data: unknown = await response.json();
      if (!mounted.current) return;
      if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true ||
          !('reply' in data) || typeof data.reply !== 'string' || !data.reply.trim()) {
        setError(responseError(502));
        return;
      }
      const reply: Message = { role: 'assistant', content: data.reply.slice(0, MAX_MESSAGE) };
      setMessages([...history, reply].slice(-MAX_HISTORY));
      setSuggestions(safeSuggestions('suggestions' in data ? data.suggestions : []));
      setDraft('');
    } catch {
      if (mounted.current) setError(responseError(502));
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setLoading(false);
      request.current = null;
    }
  }

  return (
    <Card className={styles.assistant} role="region" aria-labelledby={headingId}>
      <div className={styles.heading}>
        <span className="eyebrow">مساعدة سريعة</span>
        <h2 id={headingId}>اسأل مساعد تحدّي</h2>
        <p>اسأل عن قواعد الألعاب أو إنشاء المسابقات والانضمام إليها. الإجابات مولّدة آليًا وقد تخطئ.</p>
      </div>
      {messages.length > 0 && (
        <div className={styles.messages} role="log" aria-label="محادثة المساعدة" aria-live="polite">
          {messages.map((message, index) => (
            <div key={index} className={styles.message} data-role={message.role}>
              <strong>{message.role === 'user' ? 'أنت' : 'مساعد تحدّي'}</strong>
              <p>{message.content}</p>
            </div>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <nav className={styles.actions} aria-label="روابط المساعدة المقترحة">
          {suggestions.map((suggestion, index) => (
            <ButtonLink key={`${suggestion.route}-${index}`} href={suggestion.route} variant="outline">{suggestion.label}</ButtonLink>
          ))}
        </nav>
      )}
      <form onSubmit={send} className={styles.form}>
        <Textarea label="سؤالك عن تحدّي" value={draft} onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_MESSAGE} rows={3} disabled={loading}
          description="حتى 240 حرفًا. لا ترسل كلمات مرور أو معلومات شخصية." />
        <div className={styles.actions}>
          <Button type="submit" variant="gold" loading={loading} disabled={!draft.trim()}>
            {loading ? 'جارٍ الرد…' : 'أرسل السؤال'}
          </Button>
          {error && !error.signIn && <Button type="button" variant="outline" disabled={loading || !draft.trim()} onClick={() => void send()}>أعد المحاولة</Button>}
        </div>
      </form>
      {loading && <p role="status">يجهّز المساعد إجابتك…</p>}
      {error && <div className={styles.error} role="alert">
        <p>{error.message}</p>
        {error.signIn && <ButtonLink href="/auth/sign-in?callbackUrl=%2Fcontact" variant="outline">سجّل الدخول</ButtonLink>}
      </div>}
    </Card>
  );
}
