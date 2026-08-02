import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/auth';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { fetchActiveProductionBatches, fetchFactoryDesigns, fetchInventory } from '@/lib/supabase/factory';
import { fetchWarehouseCapacity } from '@/lib/supabase/market';
import { FACTORY_MACHINES } from '@/lib/factory/catalog';
import MachineCard from '@/components/factory/MachineCard';
import Warehouse from '@/components/factory/Warehouse';
import UpgradeWarehouseButton from '@/components/factory/UpgradeWarehouseButton';
import CollectAllButton from '@/components/factory/CollectAllButton';

export const metadata: Metadata = {
  title: '工廠 | Collector.Village',
  robots: { index: false, follow: false },
};

export default async function FactoryPage({ searchParams }: { searchParams: Promise<{ designId?: string }> }) {
  const supabase = await createClient();
  const user = await requireUser(supabase, '/factory');
  const { designId } = await searchParams;
  const initialDesignId = designId ? Number(designId) : null;

  const [balance, designs, batches, inventory, warehouseCapacity] = await Promise.all([
    fetchCurrencyBalance(supabase, user.id),
    fetchFactoryDesigns(supabase, user.id),
    fetchActiveProductionBatches(supabase, user.id),
    fetchInventory(supabase, user.id),
    fetchWarehouseCapacity(supabase, user.id),
  ]);
  const warehouseUsed = inventory.reduce((sum, item) => sum + item.quantity, 0);

  const batchesByMachine = new Map<string, typeof batches>();
  for (const batch of batches) {
    const list = batchesByMachine.get(batch.machine_key) ?? [];
    list.push(batch);
    batchesByMachine.set(batch.machine_key, list);
  }
  for (const list of batchesByMachine.values()) {
    list.sort((a, b) => new Date(a.ready_at).getTime() - new Date(b.ready_at).getTime());
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">工廠</h1>
          <p className="mt-1 text-sm text-neutral-500">買材料、選圖案，生產屬於你的周邊。</p>
        </div>
        <CollectAllButton />
      </div>

      <section className="rounded-lg border border-neutral-200 p-6">
        <p className="text-sm text-neutral-500">目前擁有</p>
        <p className="mt-1 text-lg font-medium">{balance} 枚遊戲幣</p>
      </section>

      {designs.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">
          目前圖庫還沒有任何設計圖，請先請站長新增素材才能開始生產。
        </p>
      ) : (
        <section>
          <h2 className="mb-3 text-lg font-medium">生產機台</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FACTORY_MACHINES.map((machine) => (
              <MachineCard
                key={machine.key}
                machine={machine}
                designs={designs}
                batches={batchesByMachine.get(machine.key) ?? []}
                initialDesignId={initialDesignId}
              />
            ))}
          </div>
        </section>
      )}

      <div>
        <div className="mb-3 flex justify-end">
          <UpgradeWarehouseButton />
        </div>
        <Warehouse inventory={inventory} designs={designs} capacity={{ used: warehouseUsed, total: warehouseCapacity }} />
      </div>
    </main>
  );
}
