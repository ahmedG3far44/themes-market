/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */

import Header from "../components/header";

import { ArrowLeft, ShoppingBag, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CartOrderSummary } from "../components/cart-order-summary";
import { ErrorMessage } from "../components/ui/error-message";
import { Spinner } from "../components/ui/spinner";
import { ThemeMedia } from "../components/theme-media";
import { useAppAuth } from "../context/auth-store";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { ErrorState } from "./error/error";

export default function CartPage() {
  const { user } = useAppAuth();
  const cartState = useCart();
  const [isRedirecting, setRedirecting] = useState(false);
  const redirectLock = useRef(false);
  const checkout = useAsync<{ orderId: string; checkoutUrl: string }>();
  const cart = cartState.cart;

  const pay = async () => {
    if (redirectLock.current) return;
    redirectLock.current = true;
    setRedirecting(true);
    try {
      const result = await checkout.run(api.post("/checkout/sessions", { idempotencyKey: crypto.randomUUID() }));
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== "https:") throw new Error("Stripe returned an invalid checkout URL");
      sessionStorage.setItem("pendingOrderId", result.orderId);
      window.location.assign(destination.toString());
    } catch {
      redirectLock.current = false;
      setRedirecting(false);
    }
  };

  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  if (cartState.error) return <ErrorState
    title="We couldn’t load your cart"
    message={cartState.error}
    onRetry={() => void cartState.refresh().catch(() => undefined)}
    retryLabel="Reload cart"
    backTo="/themes"
    backLabel="Browse themes"
  />;
  const checkoutBusy = checkout.isLoading || isRedirecting;

  return <div className="store-page">
    <Header />
    <main className="cart-page">

      <Link className="back-link" to="/themes"><ArrowLeft size={16} />Keep browsing</Link>

      <div className="cart-heading">
        <div><span className="eyebrow">Your selection</span><h1>Review your cart</h1><p>Everything you need to launch, ready in one secure checkout.</p></div>
        <span className="cart-count-pill"><ShoppingBag size={16} />{cart?.items.length ?? 0} {cart?.items.length === 1 ? "theme" : "themes"}</span>
      </div>

      {checkout.error && <ErrorMessage message={checkout.error} onDismiss={checkout.clearError} />}

      {cartState.isLoading && !cart ?
        <div className="page-loader"><Spinner size="md" /></div>
        : !cart?.items.length ?
          <div className="cart-empty">
            <ShoppingBag size={30} />
            <h2>Your cart is empty.</h2>
            <p>Explore the library and save a theme when one feels right.</p>
            <Link className="primary-button" to="/themes">Browse themes</Link>
          </div>
          : <>
            <div className="cart-layout">
              <section className="cart-items-panel" aria-labelledby="cart-items-title">
                <div className="cart-items-heading"><div><span className="eyebrow">Included</span><h2 id="cart-items-title">Your themes</h2></div></div>
                <div className="cart-items">{cart.items.map((item) =>
                  <article key={item.themeId}>
                    <Link className="cart-thumb" to={`/themes/${item.slug}`} aria-label={`View ${item.name}`}>{item.previewAsset ? <ThemeMedia asset={item.previewAsset} alt={`${item.name} preview`} preview /> : <span>{item.name.slice(0, 2).toUpperCase()}</span>}</Link>
                    <div className="cart-item-copy"><Link to={`/themes/${item.slug}`}><h2>{item.name}</h2></Link><p>Portfolio theme · Complete source package</p><small>Instant digital delivery</small></div>
                    <strong>{money(item.priceMinor, item.currency)}</strong>
                    <button className="icon-button danger" disabled={checkoutBusy || cartState.isLoading} onClick={() => void cartState.remove(item.themeId).catch(() => undefined)} aria-label={`Remove ${item.name}`}><Trash2 size={17} /></button>
                  </article>)}</div>
              </section>
              <CartOrderSummary cart={cart} checkoutBusy={checkoutBusy} onCheckout={() => void pay()} />
            </div>
          </>}
    </main>
  </div>;
}
