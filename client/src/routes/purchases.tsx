/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { PurchaseOverviewType } from "@shared/types";
import { Download, ExternalLink, PackageOpen, ReceiptText } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import Header from "../components/header";
import { ErrorMessage } from "../components/ui/error-message";
import { Skeleton } from "../components/ui/skeleton";
import { Spinner } from "../components/ui/spinner";
import { useToast } from "../context/toast-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { dateTime, money } from "../lib/format";

export default function PurchasesPage() {
  const request = useAsync<PurchaseOverviewType>();
  const download = useAsync<{ url: string; expiresInSeconds: number }>();
  const { notify } = useToast();
  const load = () => request.run(api.get<PurchaseOverviewType>("/purchases"));

  useEffect(() => { void load().catch(() => undefined); }, [request.run]);

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
  return <div className="store-page"><Header /><main className="library-page">
    <div className="catalog-heading"><span className="eyebrow">Your library</span><h1>Purchases and orders</h1><p>Download paid themes and follow every checkout from creation through payment confirmation.</p></div>
    {(request.error || download.error) && <ErrorMessage message={(request.error || download.error)!} onDismiss={() => { request.clearError(); download.clearError(); }} />}
    {request.isLoading && !request.data ? <div className="purchase-loading" aria-label="Loading purchases">{[1, 2, 3].map((item) => <Skeleton className="purchase-card-skeleton" key={item} />)}</div> : <>
      <section className="library-section" aria-labelledby="downloads-heading"><div className="library-section-heading"><div><span className="eyebrow">Available now</span><h2 id="downloads-heading">Theme downloads</h2></div><span>{entitlements.length} {entitlements.length === 1 ? "theme" : "themes"}</span></div>
        {entitlements.length ? <div className="purchase-grid">{entitlements.map((item) => <article className="purchase-card" key={item.id}><div className="purchase-icon"><PackageOpen size={24} /></div><div><span className={`status-pill ${item.status === "active" ? "active" : "blocked"}`}>{item.status}</span><h2>{item.theme?.name ?? "Archived theme"}</h2><p>Version {item.purchasedVersion} · Purchased {dateTime(item.purchasedAt)}</p></div><div className="download-meter"><div><span>Downloads used</span><strong>{item.downloadsUsed} / {item.downloadLimit}</strong></div><progress value={item.downloadsUsed} max={item.downloadLimit} /></div><div className="purchase-actions"><button className="primary-button" disabled={download.isLoading || item.status !== "active" || item.downloadsUsed >= item.downloadLimit} onClick={() => void getFile(item.id)}>{download.isLoading ? <Spinner size="sm" /> : <Download size={17} />}Download source</button>{item.theme && <Link className="secondary-button" to={`/themes/${item.theme.slug}`}><ExternalLink size={16} />View theme</Link>}<Link className="text-button" to={`/orders/${item.orderId}`}>View order</Link></div></article>)}</div> : <div className="library-empty"><PackageOpen size={25} /><p>Paid theme downloads will appear here after the payment webhook is confirmed.</p></div>}
      </section>

      <section className="library-section" aria-labelledby="orders-heading"><div className="library-section-heading"><div><span className="eyebrow">Payment history</span><h2 id="orders-heading">All orders</h2></div><span>{orders.length} {orders.length === 1 ? "order" : "orders"}</span></div>
        {orders.length ? <div className="customer-orders">{orders.map((order) => <Link className="customer-order-row" to={`/orders/${order.id}`} key={order.id}><span className="purchase-icon"><ReceiptText size={21} /></span><span><strong>{order.orderNumber}</strong><small>{order.items.map((item) => item.name).join(", ")}</small></span><span><strong>{money(order.totalMinor, order.currency)}</strong><small>{dateTime(order.createdAt)}</small></span><span className={`status-pill ${order.status === "paid" ? "active" : order.status === "pending" ? "pending" : "blocked"}`}>{order.status}</span></Link>)}</div> : <div className="library-empty"><ReceiptText size={25} /><p>No checkout orders have been created yet.</p></div>}
      </section>
    </>}
  </main></div>;
}
