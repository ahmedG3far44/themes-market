/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { PurchaseOverviewType } from "@shared/types";
import { CheckCircle2, Clock3, Download, ExternalLink, PackageOpen, ReceiptText, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorMessage } from "../components/ui/error-message";
import { Skeleton } from "../components/ui/skeleton";
import { Spinner } from "../components/ui/spinner";
import { useToast } from "../context/toast-store";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { dateTime, money } from "../lib/format";

import Header from "../components/header";



type PurchaseOrder = PurchaseOverviewType["orders"][number];

function OrderList({ orders, emptyMessage }: { orders: PurchaseOrder[]; emptyMessage: string }) {
  if (!orders.length) return <div className="history-empty"><ReceiptText size={22} /><p>{emptyMessage}</p></div>;
  return <div className="customer-orders">{orders.map((order) => <Link className="customer-order-row" to={`/orders/${order.id}`} key={order.id}>
    <span className="purchase-icon"><ReceiptText size={19} /></span>
    <span className="order-row-details"><strong>{order.orderNumber}</strong><small>{order.items.map((item) => item.name).join(", ")}</small></span>
    <span className="order-row-amount"><strong>{money(order.totalMinor, order.currency)}</strong><small>{dateTime(order.createdAt)}</small></span>
    <span className={`status-pill ${order.status === "paid" ? "active" : order.status === "pending" ? "pending" : "blocked"}`}>{order.status}</span>
  </Link>)}</div>;
}

export default function PurchasesPage() {
  const request = useAsync<PurchaseOverviewType>();
  const download = useAsync<{ url: string; expiresInSeconds: number }>();
  const { notify } = useToast();
  const cart = useCart();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnedOrderId = params.get("order_id") ?? sessionStorage.getItem("pendingOrderId");
  const returningFromPayment = params.get("payment") === "processing";
  const [confirmation, setConfirmation] = useState<"idle" | "processing" | "paid" | "failed" | "delayed">(returningFromPayment ? "processing" : "idle");
  const load = useCallback(() => request.run(api.get<PurchaseOverviewType>("/purchases")), [request.run]);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  useEffect(() => {
    if (!returningFromPayment || !returnedOrderId) return;
    let active = true;
    let timer: number | undefined;
    let attempts = 0;
    const poll = async () => {
      try {
        const overview = await load();
        if (!active) return;
        const order = overview.orders.find((item) => item.id === returnedOrderId);
        if (order?.status === "paid") {
          setConfirmation("paid");
          sessionStorage.removeItem("pendingOrderId");
          await cart.refresh().catch(() => undefined);
          if (!active) return;
          notify("Payment confirmed. Your theme is ready to download");
          timer = window.setTimeout(() => navigate("/purchase", { replace: true }), 1200);
          return;
        }
        if (order?.status === "failed" || order?.status === "refunded") {
          setConfirmation("failed");
          sessionStorage.removeItem("pendingOrderId");
          return;
        }
      } catch {
        if (!active) return;
      }
      attempts += 1;
      if (attempts < 30) timer = window.setTimeout(() => void poll(), 2000);
      else setConfirmation("delayed");
    };
    void poll();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [cart.refresh, load, navigate, notify, returnedOrderId, returningFromPayment]);

  const getFile = async (id: string) => {
    try {
      const result = await download.run(api.post(`/entitlements/${id}/download`));
      window.location.assign(result.url);
      notify("Your secure download is ready");
      await load();
    } catch { return; }
  };

  const entitlements = request.data?.entitlements ?? [];
  const orders = request.data?.orders ?? [];
  const transactions = orders.filter((order) => order.status === "pending" || order.status === "failed");
  const completedOrders = orders.filter((order) => order.status === "paid");



  return <div className="store-page">
    <Header />
    <main className="library-page">
      <div className="catalog-heading">
        <span className="eyebrow">Your library</span><h1>Purchases and orders</h1>
        <p>Download paid themes and follow every checkout from creation through payment confirmation.</p>
      </div>

      {confirmation !== "idle" && <div className={`payment-confirmation ${confirmation}`} role="status" aria-live="polite">
        {confirmation === "processing" ? <Spinner size="sm" /> : confirmation === "paid" ? <CheckCircle2 /> : confirmation === "failed" ? <XCircle /> : <Clock3 />}
        <div><strong>{confirmation === "paid" ? "Payment confirmed" : confirmation === "failed" ? "Payment was not completed" : confirmation === "delayed" ? "Confirmation is taking longer than expected" : "Confirming your payment"}</strong>
          <span>{confirmation === "paid" ? "Your cart is empty and your download is now available." : confirmation === "failed" ? "Your order was not charged successfully." : "This page will update when Stripe's signed webhook arrives."}</span></div>
      </div>}

      {(request.error || download.error) && <ErrorMessage message={(request.error || download.error)!} onDismiss={() => { request.clearError(); download.clearError(); }} />}
      {request.isLoading && !request.data ? <div className="purchase-loading" aria-label="Loading purchases">{[1, 2, 3].map((item) => <Skeleton className="purchase-card-skeleton" key={item} />)}</div> : <>
        <section className="library-section" aria-labelledby="downloads-heading">
          <div className="library-section-heading"><div><span className="eyebrow">Available now</span><h2 id="downloads-heading">Theme downloads</h2></div><span>{entitlements.length} {entitlements.length === 1 ? "theme" : "themes"}</span></div>
        {entitlements.length ? <div className="purchase-grid">{entitlements.map((item) => <article className="purchase-card" key={item.id}><div className="purchase-icon"><PackageOpen size={24} /></div><div><span className={`status-pill ${item.status === "active" ? "active" : "blocked"}`}>{item.status}</span><h2>{item.theme?.name ?? "Archived theme"}</h2><p>Version {item.purchasedVersion} · Purchased {dateTime(item.purchasedAt)}</p></div><div className="download-meter"><div><span>Downloads used</span><strong>{item.downloadsUsed} / {item.downloadLimit}</strong></div><progress value={item.downloadsUsed} max={item.downloadLimit} /></div><div className="purchase-actions"><button className="primary-button" disabled={download.isLoading || item.status !== "active" || item.downloadsUsed >= item.downloadLimit} onClick={() => void getFile(item.id)}>{download.isLoading ? <Spinner size="sm" /> : <Download size={17} />}Download source</button>{item.theme && <Link className="secondary-button" to={`/themes/${item.theme.slug}`}><ExternalLink size={16} />View theme</Link>}<Link className="text-button" to={`/orders/${item.orderId}`}>View order</Link></div></article>)}</div> : <div className="library-empty"><PackageOpen size={25} /><p>Paid theme downloads will appear here after the payment webhook is confirmed.</p></div>}
        </section>

      <section className="library-section order-history-section" aria-label="Order history">
        <div className="space-y-4">
          <article className="order-history-panel completed-panel">
            <header><div><span className="eyebrow">Payment confirmed</span><h2>Completed orders</h2><p>Paid orders with available purchase details.</p></div><span className="history-count">{completedOrders.length}</span></header>
            <OrderList orders={completedOrders} emptyMessage="No completed orders yet." />
          </article>
          <article className="order-history-panel transactions-panel">
            <header><div><span className="eyebrow">Needs attention</span><h2>Transactions History</h2><p>Pending and unsuccessful checkout attempts.</p></div><span className="history-count">{transactions.length}</span></header>
            <OrderList orders={transactions} emptyMessage="No pending or failed transactions." />
          </article>
        </div>
      </section>
    </>}
  </main></div>;
}
