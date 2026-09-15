/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */

import Header from "../components/header";

import { ArrowLeft, CreditCard, LockKeyhole, ShoppingBag, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ErrorMessage } from "../components/ui/error-message";
import { Spinner } from "../components/ui/spinner";
import { ThemeMedia } from "../components/theme-media";
import { useAppAuth } from "../context/auth-store";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { money } from "../lib/format";

export default function CartPage() {
  const { user } = useAppAuth();
  const cartState = useCart();
  const [code, setCode] = useState("");
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
  const checkoutBusy = checkout.isLoading || isRedirecting;

  return <div className="store-page">
    <Header />
    <main className="cart-page">

      <Link className="back-link" to="/themes"><ArrowLeft size={16} />Keep browsing</Link>

      <div className="cart-heading">
        <span className="eyebrow">Your selection</span>
        <h1>Cart</h1>
        <p>{cart?.items.length ?? 0} {cart?.items.length === 1 ? "theme" : "themes"} ready for checkout.</p>
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
          : <div className="cart-layout">

            <section className="cart-items">
              {cart.items.map((item) =>
                <article key={item.themeId}>
                  <Link className="cart-thumb" to={`/themes/${item.slug}`} aria-label={`View ${item.name}`}>{item.previewAsset ? <ThemeMedia asset={item.previewAsset} alt={`${item.name} preview`} preview /> : <span>{item.name.slice(0, 2).toUpperCase()}</span>}</Link>
                  <div><Link to={`/themes/${item.slug}`}><h2>{item.name}</h2></Link><p>Portfolio theme · Instant digital delivery</p></div>
                  <strong>{money(item.priceMinor, item.currency)}</strong>
                  <button className="icon-button danger" disabled={checkoutBusy} onClick={() => void cartState.remove(item.themeId).catch(() => undefined)} aria-label={`Remove ${item.name}`}><Trash2 size={17} /></button>
                </article>)}
            </section>

            <aside className="order-summary">
              <h2>Order summary</h2>

              <dl>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(cart.subtotalMinor, cart.currency)}</dd>
                </div>

                <div className="discount-form">

                  {cart.discountCode ?
                    <button className="text-button" disabled={checkoutBusy} onClick={() => void cartState.clearDiscount().catch(() => undefined)}>Remove discount</button>
                    : <>
                      <input value={code} disabled={checkoutBusy} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Discount code" />
                      <button className="secondary-button" disabled={!code || cartState.isLoading || checkoutBusy} onClick={() => void cartState.applyDiscount(code).catch(() => undefined)}>Apply</button>
                    </>}
                </div>

                {cart.discountMinor > 0 && <div className="discount-row">
                  <dt>{cart.discountCode} ({cart.discountPercentage}%)</dt>
                  <dd>−{money(cart.discountMinor, cart.currency)}</dd>
                </div>
                }
                <div className="summary-total my-4">
                  <dt>Total</dt>
                  <dd>{money(cart.totalMinor, cart.currency)}</dd>
                </div>

              </dl>



              <fieldset className="payment-providers" disabled={checkoutBusy}><legend>Payment method</legend><label className="selected">

                <input type="radio" name="payment-provider" value="stripe" checked readOnly /><CreditCard size={17} />

                <span><strong>Stripe</strong><small>Secure checkout in {cart.currency}</small></span></label></fieldset>

              <button type="button" className="primary-button checkout-button" onClick={() => void pay()} disabled={checkoutBusy}>
                {checkoutBusy ? <Spinner size="sm" /> : <LockKeyhole size={17} />}{checkoutBusy ? "Processing Checkout..." : `Secure checkout`}
              </button>

              <p className="checkout-note mt-2">Stripe securely processes payment. Downloads unlock after signed payment confirmation.</p>
            </aside>
          </div>}
    </main>
  </div>;
}

