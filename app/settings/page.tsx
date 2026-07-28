import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/auth';
import { fetchUserProfile } from '@/lib/supabase/users';
import ProfileForm from './ProfileForm';
import PasswordForm from './PasswordForm';
import DeleteAccountForm from './DeleteAccountForm';

export const metadata: Metadata = {
  title: '個人設定 | Collector.Village',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await requireUser(supabase, '/settings');
  const profile = await fetchUserProfile(supabase, user.id);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-10 px-4 py-10">
      <h1 className="text-2xl font-semibold">個人設定</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">基本資料</h2>
        <ProfileForm
          userId={user.id}
          initialUsername={profile?.username ?? ''}
          initialSocialLinks={profile?.social_links ?? {}}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">密碼</h2>
        <PasswordForm />
      </section>

      <section className="flex flex-col gap-4 rounded border border-red-200 p-4">
        <h2 className="text-lg font-medium text-red-700">刪除帳號</h2>
        <p className="text-sm text-neutral-600">
          刪除帳號將永久移除你的收藏紀錄、上傳照片與提交紀錄，此操作無法復原。
        </p>
        <DeleteAccountForm />
      </section>
    </main>
  );
}
