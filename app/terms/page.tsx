import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服務條款 | Collector.Village',
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-16 text-sm leading-relaxed text-neutral-700">
      <h1 className="text-2xl font-semibold text-neutral-900">服務條款</h1>
      <p>本頁為工程規劃層級之條款要點整理，非正式法律意見。</p>

      <h2 className="mt-4 font-semibold text-neutral-900">使用年齡</h2>
      <p>
        本服務最低使用年齡為 13 歲。未滿 18 歲之使用者，需徵得法定代理人（監護人）同意方可使用本服務。
      </p>

      <h2 className="mt-4 font-semibold text-neutral-900">禁止行為</h2>
      <ul className="list-disc pl-5">
        <li>上傳不當、違法或侵害他人權利之內容</li>
        <li>騷擾、冒充其他使用者</li>
        <li>以任何形式干擾或破壞本服務之正常運作</li>
      </ul>

      <h2 className="mt-4 font-semibold text-neutral-900">帳號管理</h2>
      <p>
        若使用者違反上述禁止行為，開發者保留暫停或終止該帳號使用權利之權利。使用者可隨時於「個人設定」頁申請刪除帳號。
      </p>

      <h2 className="mt-4 font-semibold text-neutral-900">內容免責</h2>
      <p>
        本站為非官方粉絲自製之收藏管理工具，與原作、出版社、玩具製造商無任何關聯或授權關係；
        所有角色、商品名稱、商標均屬原權利人所有；商品資料僅供收藏管理參考，正確性以官方資訊為準。
      </p>
    </main>
  );
}
