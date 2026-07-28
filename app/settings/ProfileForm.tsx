'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { updateUserProfile } from '@/lib/supabase/users';

const SOCIAL_FIELDS = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'threads', label: 'Threads' },
] as const;

export default function ProfileForm({
  userId,
  initialUsername,
  initialSocialLinks,
}: {
  userId: string;
  initialUsername: string;
  initialSocialLinks: Record<string, string>;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(initialSocialLinks);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const cleanedLinks = Object.fromEntries(
        Object.entries(socialLinks).filter(([, v]) => v.trim() !== '')
      );
      await updateUserProfile(supabase, userId, {
        username: username.trim() || null,
        social_links: Object.keys(cleanedLinks).length > 0 ? cleanedLinks : null,
      });
      setMessage('已儲存');
    } catch {
      setError('儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        顯示暱稱
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      {SOCIAL_FIELDS.map(({ key, label }) => (
        <label key={key} className="flex flex-col gap-1 text-sm">
          {label}
          <input
            type="url"
            value={socialLinks[key] ?? ''}
            onChange={(e) => setSocialLinks((prev) => ({ ...prev, [key]: e.target.value }))}
            placeholder="https://"
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
      <button
        type="submit"
        disabled={saving}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {saving ? '儲存中…' : '儲存'}
      </button>
    </form>
  );
}
