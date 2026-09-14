/* useAsync.run and CartContext.refresh are stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { OrderType } from "@shared/types";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Header from "../components/header";
import { ErrorMessage } from "../components/ui/error-message";
import { Spinner } from "../components/ui/spinner";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";

export function CheckoutSuccess() {
  const [params] = useSearchParams();
  const storedOrderId = sessionStorage.getItem("pendingOrderId");
  const returnedOrderId = params.get("order_id");
  const stripeSessionId = params.get("session_id");
  const [orderId, setOrderId] = useState(storedOrderId ?? returnedOrderId);
  const [pollVersion, setPollVersion] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const lookup = useAsync<OrderType>();
  const request = useAsync<OrderType>();
  const cart = useCart();

  useEffect(() => {
    if (orderId || !stripeSessionId) return;
    void lookup.run(api.get<OrderType>(`/checkout/sessions/${encodeURIComponent(stripeSessionId)}/order`)).then((order) => setOrderId(order.id)).catch(() => undefined);
  }, [orderId, stripeSessionId, lookup.run]);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let attempts = 0;
    setTimedOut(false);
    const poll = async () => {
      try {
        const order = await request.run(api.get<OrderType>(`/orders/${orderId}`));
        if (!active) return;
        if (order.status === "paid") {
          sessionStorage.removeItem("pendingOrderId");
          sessionStorage.removeItem("pendingPaymentProvider");
          await cart.refresh();
          return;
        }
        if (order.status === "failed" || order.status === "refunded") return;
      } catch {
        if (!active) return;
      }
      attempts += 1;
      if (attempts < 30) window.setTimeout(() => void poll(), 2000);
      else setTimedOut(true);
    };
    void poll();
    return () => { active = false; };
  }, [orderId, pollVersion, request.run, cart.refresh]);

  const order = request.data ?? lookup.data;
  const paid = order?.status === "paid";
  const failed = order?.status === "failed" || order?.status === "refunded";
  const missingReference = !orderId && !stripeSessionId;
  const error = lookup.error ?? (missingReference ? "The checkout return did not include an order reference." : null);

  return <div className="store-page"><Header /><main className="result-page">
    {paid ? <CheckCircle2 className="result-icon success" /> : failed ? <XCircle className="result-icon cancel" /> : timedOut ? <Clock3 className="result-icon" /> : <Spinner size="md" />}
    <h1>{paid ? "Your themes are ready." : failed ? "Payment was not completed." : timedOut ? "Payment is still processing." : "Confirming your payment…"}</h1>
    <p>{paid ? "The payment webhook confirmed your order, cleared your cart, and unlocked your downloads." : failed ? "The provider reported that this checkout failed or expired. Your themes remain available to add again." : timedOut ? "The payment provider has not confirmed this order yet. You can check again without being charged twice." : "Your payment provider returned you safely. We’re waiting for its signed webhook confirmation."}</p>
    {error && <ErrorMessage message={error} />}
    {paid && order ? <div><Link className="primary-button" to="/purchases">Open purchases</Link><Link className="secondary-button" to={`/orders/${order.id}`}>View receipt</Link></div> : failed ? <div><Link className="primary-button" to="/cart">Return to cart</Link><Link className="secondary-button" to="/purchases">View orders</Link></div> : timedOut ? <div><button className="primary-button" onClick={() => setPollVersion((value) => value + 1)}>Check again</button><Link className="secondary-button" to="/purchases">View order history</Link></div> : null}
  </main></div>;
}

export function CheckoutCancel() {
  return <div className="store-page"><Header /><main className="result-page"><XCircle className="result-icon cancel" /><h1>Checkout canceled.</h1><p>Nothing was charged. Your selected themes are still in your cart.</p><div><Link className="primary-button" to="/cart">Return to cart</Link><Link className="secondary-button" to="/themes">Keep browsing</Link></div></main></div>;
}
