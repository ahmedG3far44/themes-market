import type { PurchaseOrder } from "./order-list";
import { OrderRows } from "./order-list";

export function TransactionList({ orders }: { orders: PurchaseOrder[] }) {
  const transactions = orders.filter((order) => order.status === "pending" || order.status === "failed");

  return <article className="order-history-panel transactions-panel">
    <header>
      <div><span className="eyebrow">Needs attention</span><h2>Transaction history</h2><p>Pending and unsuccessful checkout attempts.</p></div>
      <span className="history-count">{transactions.length}</span>
    </header>
    <OrderRows orders={transactions} emptyMessage="No pending or failed transactions." />
  </article>;
}
