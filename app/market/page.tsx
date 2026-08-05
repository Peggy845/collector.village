import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/supabase/auth';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { fetchFactoryDesigns, fetchInventory } from '@/lib/supabase/factory';
import {
  fetchMarketAutoRestockState,
  fetchMarketOpenState,
  fetchFurniture,
  fetchFurnitureSlots,
} from '@/lib/supabase/market';
import { autoRestockUser } from '@/lib/market/restock';
import MarketGrid from '@/components/market/MarketGrid';
import RevenuePanel from '@/components/market/RevenuePanel';
import MarketOpenToggle from '@/components/market/MarketOpenToggle';
import MarketAutoRestockToggle from '@/components/market/MarketAutoRestockToggle';
import MarketAutoRefresh from '@/components/market/MarketAutoRefresh';

export const metadata: Metadata = {
  title: '超市 | Collector.Village',
  robots: { index: false, follow: false },
};

export default async function MarketPage() {
  const supabase = await createClient();
  const user = await requireUser(supabase, '/market');

  // 自動上架模式開啟時，每次進來這個頁面都先幫忙補一次貨（見 lib/market/restock.ts），
  // 這樣玩家一進頁面看到的就是補完的狀態，不用等下一次導覽列輪詢（每45秒）才補上。
  await autoRestockUser(createAdminClient(), user.id);

  const [balance, designs, inventory, furniture, slots, marketState, autoRestock] = await Promise.all([
    fetchCurrencyBalance(supabase, user.id),
    fetchFactoryDesigns(supabase, user.id),
    fetchInventory(supabase, user.id),
    fetchFurniture(supabase, user.id),
    fetchFurnitureSlots(supabase, user.id),
    fetchMarketOpenState(supabase, user.id),
    fetchMarketAutoRestockState(supabase, user.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10">
      <MarketAutoRefresh enabled={autoRestock} slots={slots} marketOpen={marketState.open} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">超市</h1>
          <p className="mt-1 text-sm text-neutral-500">
            在場地上放置家具、把工廠倉庫的成品上架，家具會自動每分鐘賣出 1 件，賣了記得回來結算入帳。
          </p>
          <Link href="/factory" className="mt-2 inline-block text-xs text-neutral-500 underline hover:text-neutral-900">
            去工廠繼續生產 →
          </Link>
        </div>
        <div className="flex flex-col items-end gap-2">
          <MarketOpenToggle open={marketState.open} />
          <MarketAutoRestockToggle autoRestock={autoRestock} />
        </div>
      </div>

      <section className="rounded-lg border border-neutral-200 p-6">
        <p className="text-sm text-neutral-500">目前擁有</p>
        <p className="mt-1 text-lg font-medium">{balance} 枚遊戲幣</p>
      </section>

      <RevenuePanel slots={slots} marketOpen={marketState.open} marketClosedAt={marketState.closedAt} />

      <MarketGrid
        furniture={furniture}
        slots={slots}
        inventory={inventory}
        designs={designs}
        marketOpen={marketState.open}
        marketClosedAt={marketState.closedAt}
        balance={balance}
      />
    </main>
  );
}
