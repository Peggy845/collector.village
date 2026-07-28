'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { Ip, Series } from '@/types/database';
import type { FilterFacets } from '@/lib/supabase/products';

interface Props {
  ips: Ip[];
  seriesList: Series[];
  facets: FilterFacets;
}

export default function FilterPanel({ ips, seriesList, facets }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentIp = searchParams.get('ip') ?? '';
  const currentSeries = searchParams.get('series') ?? '';
  const currentCategoryGroup = searchParams.get('category_group') ?? '';
  const currentCategory = searchParams.get('category') ?? '';
  const currentKuji = searchParams.get('kuji') ?? '';
  const currentCharacters = searchParams.getAll('character');

  function updateParam(name: string, value: string, resetKeys: string[] = []) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    resetKeys.forEach((k) => params.delete(k));
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleCharacter(character: string) {
    const params = new URLSearchParams(searchParams.toString());
    const chars = params.getAll('character');
    params.delete('character');
    const next = chars.includes(character)
      ? chars.filter((c) => c !== character)
      : [...chars, character];
    next.forEach((c) => params.append('character', c));
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(pathname);
  }

  const categoriesForGroup = currentCategoryGroup
    ? facets.categoriesByGroup[currentCategoryGroup] ?? []
    : [];

  return (
    <aside className="flex w-full flex-col gap-4 text-sm md:w-64 md:shrink-0">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">篩選</h2>
        <button type="button" onClick={clearFilters} className="text-xs text-neutral-500 underline">
          清除篩選
        </button>
      </div>

      <label className="flex flex-col gap-1">
        作品
        <select
          value={currentIp}
          onChange={(e) => updateParam('ip', e.target.value, ['series'])}
          className="rounded border border-neutral-300 px-2 py-1"
        >
          <option value="">全部</option>
          {ips.map((ip) => (
            <option key={ip.id} value={ip.id}>
              {ip.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        系列/活動
        <select
          value={currentSeries}
          onChange={(e) => updateParam('series', e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1"
        >
          <option value="">全部</option>
          {seriesList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        大分類
        <select
          value={currentCategoryGroup}
          onChange={(e) => updateParam('category_group', e.target.value, ['category'])}
          className="rounded border border-neutral-300 px-2 py-1"
        >
          <option value="">全部</option>
          {facets.categoryGroups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>

      {currentCategoryGroup && (
        <label className="flex flex-col gap-1">
          細分類
          <select
            value={currentCategory}
            onChange={(e) => updateParam('category', e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            <option value="">全部</option>
            {categoriesForGroup.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        賞別
        <select
          value={currentKuji}
          onChange={(e) => updateParam('kuji', e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1"
        >
          <option value="">全部</option>
          {facets.kujiPrizeTiers.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      {facets.characters.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-medium">角色</legend>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {facets.characters.map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={currentCharacters.includes(c)}
                  onChange={() => toggleCharacter(c)}
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </aside>
  );
}
