/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { IUser, OrderType } from "@shared/types";
import { ArrowLeft, Download, Mail, ReceiptText, User } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorMessage } from "../../components/ui/error-message";
import { Spinner } from "../../components/ui/spinner";
import { useAsync } from "../../hooks/use-async";
import { api, saveApiFile } from "../../lib/api";
import { dateTime, money } from "../../lib/format";

interface AdminOrder extends OrderType { user: Pick<IUser, "name" | "email" | "provider"> }

export default function AdminOrderDetailPage() {
  const { id } = useParams();

  const request = useAsync<AdminOrder>();
  const invoice = useAsync<{ blob: Blob; filename: string }>();

  useEffect(() => {
    if (id) void request.run(api.get(`/admin/orders/${id}`)).catch(() => undefined);
  }, [id, request.run]);

  const order = request.data;

  if (request.isLoading && !order) return <main className="admin-page">
    <div className="page-loader"><Spinner size="md" /></div>
  </main>;

  if (request.error || !order) return <main className="admin-page">
    <ErrorMessage message={request.error ?? "Order not found"} />
  </main>;

  return <main className="admin-page">
    <Link className="back-link" to="/admin/orders">
      <ArrowLeft size={16} />All marketplace orders</Link>
    <div className="order-admin-heading">
      <div><span className="eyebrow">Order details</span>
        <h1>{order.orderNumber}</h1>
        <p>Created {dateTime(order.createdAt)} {order.paidAt && `· Paid ${dateTime(order.paidAt)}`}</p>
      </div>
      <div className="order-heading-actions">
        <span className={`status-pill ${order.status === "paid" ? "active" : "blocked"}`}>
          {order.status}</span>{order.status === "paid" &&
            <button className="secondary-button" type="button" disabled={invoice.isLoading} onClick={() => void invoice.run(api.download(`/admin/orders/${order.id}/invoice`)).then(saveApiFile).catch(() => undefined)}>
              {invoice.isLoading ? <Spinner size="sm" /> : <Download size={16} />}Invoice PDF</button>}
      </div>
    </div>

    {invoice.error && <ErrorMessage message={invoice.error} onDismiss={invoice.clearError} />}
    <div className="admin-order-grid">
      <article className="panel order-lines">
        <div className="panel-heading">
          <div><h2><ReceiptText size={18} />Purchased themes</h2>
            <p>The product and price snapshots captured at checkout.</p></div></div>
        {order.items.map((item) => <div className="order-line" key={item.id}><div>
          <strong>{item.name}</strong>
          <span>Version {item.version} · Theme ID {item.themeId}</span></div>
          <dl>
            <dt>Price</dt><dd>{money(item.priceMinor, order.currency)}</dd>
            {item.discountMinor > 0 && <>
              <dt>Discount</dt><dd>−{money(item.discountMinor, order.currency)}</dd>
            </>}
            <dt>Total</dt><dd><strong>{money(item.totalMinor, order.currency)}</strong></dd>
          </dl>
        </div>)}
      </article>
      <aside>
        <article className="panel customer-panel">

          <h2>Customer</h2>

          <p><User size={16} />{order.user?.name ?? "Deleted user"}</p>
          <p><Mail size={16} />{order.user?.email ?? "Retained order record"}</p>
          <small className="flex items-center gap-2 my-2">
            <span className="capitalize">{order.user.provider}</span>
          </small>
        </article>
        <article className="panel totals-panel">
          <h2>Payment summary</h2>
          <dl>
            <div>
              <dt>Subtotal</dt><dd>{money(order.subtotalMinor, order.currency)}</dd>
            </div>
            <div>
              {order.discountMinor > 0 && <>
                <dt>Discount {order.discountSnapshot?.code && `(${order.discountSnapshot.code})`}</dt>
                <dd>−{money(order.discountMinor, order.currency)}</dd>
              </>}
            </div>
            {order.taxMinor > 0 && <div>
              <dt>Tax</dt><dd>{money(order.taxMinor, order.currency)}</dd>
            </div>}
            <div className="summary-total"><dt>Total</dt><dd>{money(order.totalMinor, order.currency)}</dd></div></dl></article>
      </aside>
    </div>
  </main>
}
