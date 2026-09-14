/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */

import Header from "../components/header";

import type { OrderType } from "@shared/types";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorMessage } from "../components/ui/error-message";
import { Spinner } from "../components/ui/spinner";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { dateTime, money } from "../lib/format";

export default function OrderDetailPage() { const { id } = useParams(); const request = useAsync<OrderType>(); useEffect(() => { if (id) void request.run(api.get<OrderType>(`/orders/${id}`)).catch(() => undefined); }, [id, request.run]); return <div className="store-page"><Header /><main className="receipt-page"><Link className="back-link" to="/purchases"><ArrowLeft size={16} />Your library</Link>{request.isLoading && !request.data ? <div className="page-loader"><Spinner size="md" /></div> : request.error || !request.data ? <ErrorMessage message={request.error ?? "Order not found"} /> : <article className="receipt"><header><div className="receipt-icon"><ReceiptText /></div><div><span className="eyebrow">Order receipt</span><h1>{request.data.orderNumber}</h1><p>{dateTime(request.data.createdAt)}</p></div><span className={`status-pill ${request.data.status === "paid" ? "active" : "blocked"}`}>{request.data.status}</span></header><div className="receipt-items">{request.data.items.map((item) => <div key={item.id ?? item.themeId}><div><strong>{item.name}</strong><span>Version {item.version}</span></div><b>{money(item.totalMinor, request.data!.currency)}</b></div>)}</div><dl><div><dt>Subtotal</dt><dd>{money(request.data.subtotalMinor, request.data.currency)}</dd></div>{request.data.discountMinor > 0 && <div><dt>Discount ({request.data.discountSnapshot?.code})</dt><dd>−{money(request.data.discountMinor, request.data.currency)}</dd></div>}{request.data.taxMinor > 0 && <div><dt>Tax</dt><dd>{money(request.data.taxMinor, request.data.currency)}</dd></div>}<div className="summary-total"><dt>Total</dt><dd>{money(request.data.totalMinor, request.data.currency)}</dd></div></dl></article>}</main></div>; }
