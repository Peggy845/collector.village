import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隱私權政策 | Collector.Village',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-16 text-sm leading-relaxed text-neutral-700">
      <h1 className="text-2xl font-semibold text-neutral-900">隱私權政策</h1>
      <p>本頁為工程規劃層級之政策要點整理，非正式法律意見。</p>

      <h2 className="mt-4 font-semibold text-neutral-900">我們如何使用你的資料</h2>
      <p>
        帳號資料（Email、暱稱）用於登入與顯示；收藏紀錄（擁有狀態、備註、照片）預設完全私人，
        僅你本人可見，其他使用者一律看不到。
      </p>

      <h2 className="mt-4 font-semibold text-neutral-900">照片</h2>
      <p>
        你上傳的收藏照片儲存於私有空間，僅透過短期簽名網址存取，不會公開於網路上可被搜尋或瀏覽。
      </p>

      <h2 className="mt-4 font-semibold text-neutral-900">資料刪除</h2>
      <p>
        你可以於「個人設定」頁申請刪除帳號，執行後你的收藏紀錄、上傳照片、商品回報紀錄將一併刪除或去識別化。
      </p>
    </main>
  );
}
