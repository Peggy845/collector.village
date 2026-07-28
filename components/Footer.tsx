import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-neutral-200 px-4 py-6 text-xs text-neutral-500">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <p>
          本站為非官方粉絲自製之收藏管理工具，與原作、出版社、玩具製造商無任何關聯或授權關係；
          所有角色、商品名稱、商標均屬原權利人所有；商品資料僅供收藏管理參考，正確性以官方資訊為準。
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
