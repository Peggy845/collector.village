import type { RoomItem } from './roomItems';

// 玩家自己新增的收藏（對應第七節第9點定案的欄位：照片正反面、IP名稱、角色名稱、娃娃全名）。
// 跟8隻種子娃娃一樣是RoomItem，額外加篩選用的標籤欄位。
export interface CustomRoomItem extends RoomItem {
  ipName: string;
  characterName: string;
  fullName: string;
}

// 夢幻房間demo目前刻意不接Supabase（見討論文件第八節「暫時獨立於Collector.Village之外」），
// 這裡先用localStorage存這批「玩家自己新增的收藏」資料本身（不是家具擺放位置，那個仍是
// 第四節開放問題第7點還沒做的持久化，兩者是不同範圍的決定）。重新整理不會遺失剛拍好、
// 剛花時間標記的收藏，但擺放位置還是會清空——這個不對稱是刻意的：拍照+標籤的成本
// （尤其去背要等10幾秒）比拖曳擺放的成本高很多，值得先保護。
const STORAGE_KEY = 'dream-room-custom-items-v1';

export function loadCustomItems(): CustomRoomItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomRoomItem[]) : [];
  } catch {
    return [];
  }
}

function saveCustomItems(items: CustomRoomItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addCustomItem(item: CustomRoomItem): CustomRoomItem[] {
  const items = [...loadCustomItems(), item];
  saveCustomItems(items);
  return items;
}

export function removeCustomItem(id: string): CustomRoomItem[] {
  const items = loadCustomItems().filter((item) => item.id !== id);
  saveCustomItems(items);
  return items;
}
