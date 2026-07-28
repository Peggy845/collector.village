import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-neutral-200 px-4 py-6 text-xs text-neutral-500">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <p>
          本網站「Collector.Village」為非官方之粉絲自製收藏管理工具，網站中所收錄之各項動漫周邊商品資訊，
          其中涉及之角色名稱、商品名稱、商標及相關智慧財產權，均屬各自原著作權人（含原作者、出版社、動畫製作公司及玩具製造商）所有，
          本站與其無任何關聯、合作或授權關係。網站不儲存、不販售任何官方商品圖片，商品資訊僅供收藏整理參考，正確性請以官方公告為準。
          若有任何疑義或需要下架處理，歡迎與開發者聯繫。
        </p>
        <div className="flex gap-4">
          <Link href="/terms" className="underline">
            服務條款
          </Link>
          <Link href="/privacy" className="underline">
            隱私權政策
          </Link>
        </div>
      </div>
    </footer>
  );
}
