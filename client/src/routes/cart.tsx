/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import { ArrowLeft, CreditCard, LockKeyhole, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import Header from "../components/header";
import { ErrorMessage } from "../components/ui/error-message";
import { Spinner } from "../components/ui/spinner";
import { useAppAuth } from "../context/auth-store";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { money } from "../lib/format";

type PaymentProvider = "stripe" | "paymob";
interface ProviderResponse { country: string | null; defaultProvider: PaymentProvider; providers: PaymentProvider[]; usdToEgpRate: number }

export default function CartPage() {
  const { user } = useAppAuth();
  const cartState = useCart();
  const [code, setCode] = useState("");
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [isRedirecting, setRedirecting] = useState(false);
  const redirectLock = useRef(false);
  const checkout = useAsync<{ orderId: string; checkoutUrl: string; provider: PaymentProvider }>();
  const providerRequest = useAsync<ProviderResponse>();
  const cart = cartState.cart;

  useEffect(() => {
    if (user?.role !== "admin") void providerRequest.run(api.get<ProviderResponse>("/checkout/providers")).catch(() => undefined);
  }, [providerRequest.run, user?.role]);
  useEffect(() => {
    const methods = providerRequest.data?.providers;
    if (!methods?.length) return;
    setProvider((current) => current && methods.includes(current) ? current : (methods.includes(providerRequest.data!.defaultProvider) ? providerRequest.data!.defaultProvider : methods[0]));
  }, [providerRequest.data]);

  const pay = async () => {
    if (redirectLock.current) return;
    redirectLock.current = true;
    setRedirecting(true);
    try {
      if (!provider) throw new Error("The configured payment provider is unavailable");
      const result = await checkout.run(api.post("/checkout/sessions", { idempotencyKey: crypto.randomUUID(), provider }));
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== "https:") throw new Error("The payment provider returned an invalid checkout URL");
      sessionStorage.setItem("pendingOrderId", result.orderId);
      sessionStorage.setItem("pendingPaymentProvider", result.provider);
      window.location.assign(destination.toString());
    } catch {
      redirectLock.current = false;
      setRedirecting(false);
    }
  };

  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  const checkoutBusy = checkout.isLoading || isRedirecting;
  const availableProviders = providerRequest.data?.providers ?? [];
  const egpTotal = cart && providerRequest.data?.usdToEgpRate ? Math.round(cart.totalMinor * providerRequest.data.usdToEgpRate) : null;

  return <div className="store-page"><Header /><main className="cart-page">
    <Link className="back-link" to="/themes"><ArrowLeft size={16} />Keep browsing</Link>
    <div className="cart-heading"><span className="eyebrow">Your selection</span><h1>Cart</h1><p>{cart?.items.length ?? 0} {cart?.items.length === 1 ? "theme" : "themes"} ready for checkout.</p></div>
    {(checkout.error || providerRequest.error) && <ErrorMessage message={checkout.error ?? providerRequest.error ?? "Unable to load payment methods"} onDismiss={() => { checkout.clearError(); providerRequest.clearError(); }} />}
    {cartState.isLoading && !cart ? <div className="page-loader"><Spinner size="md" /></div> : !cart?.items.length ? <div className="cart-empty"><ShoppingBag size={30} /><h2>Your cart is empty.</h2><p>Explore the library and save a theme when one feels right.</p><Link className="primary-button" to="/themes">Browse themes</Link></div> : <div className="cart-layout">
      <section className="cart-items">{cart.items.map((item) => <article key={item.themeId}><div className="cart-thumb">{item.name.slice(0, 2).toUpperCase()}</div><div><Link to={`/themes/${item.slug}`}><h2>{item.name}</h2></Link><p>Portfolio theme · Instant digital delivery</p></div><strong>{money(item.priceMinor, item.currency)}</strong><button className="icon-button danger" disabled={checkoutBusy} onClick={() => void cartState.remove(item.themeId).catch(() => undefined)} aria-label={`Remove ${item.name}`}><Trash2 size={17} /></button></article>)}</section>
      <aside className="order-summary"><h2>Order summary</h2><dl><div><dt>Subtotal</dt><dd>{money(cart.subtotalMinor, cart.currency)}</dd></div>{cart.discountMinor > 0 && <div className="discount-row"><dt>{cart.discountCode} ({cart.discountPercentage}%)</dt><dd>−{money(cart.discountMinor, cart.currency)}</dd></div>}<div className="summary-total"><dt>Total</dt><dd>{money(cart.totalMinor, cart.currency)}</dd></div></dl>
        <div className="discount-form">{cart.discountCode ? <button className="text-button" disabled={checkoutBusy} onClick={() => void cartState.clearDiscount().catch(() => undefined)}>Remove discount</button> : <><input value={code} disabled={checkoutBusy} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Discount code" /><button className="secondary-button" disabled={!code || cartState.isLoading || checkoutBusy} onClick={() => void cartState.applyDiscount(code).catch(() => undefined)}>Apply</button></>}</div>
        <fieldset className="payment-providers" disabled={checkoutBusy || providerRequest.isLoading}><legend>Payment method</legend>{providerRequest.isLoading ? <div className="payment-loading"><Spinner size="sm" />Loading payment methods…</div> : (["stripe", "paymob"] as PaymentProvider[]).map((value) => { const available = availableProviders.includes(value); return <label key={value} className={`${provider === value ? "selected" : ""}${available ? "" : " unavailable"}`} aria-disabled={!available}><input type="radio" name="payment-provider" value={value} checked={provider === value} disabled={!available} onChange={() => setProvider(value)} /><CreditCard size={17} /><span><strong>{value === "stripe" ? "Stripe" : "Paymob"}</strong><small>{value === "stripe" ? "Secure checkout in USD" : available && egpTotal !== null ? `${money(egpTotal, "EGP")} · 1 USD = ${providerRequest.data?.usdToEgpRate} EGP` : "Available in Egypt, Saudi Arabia, Oman, and the UAE"}</small></span></label>; })}</fieldset>
        <button type="button" className="primary-button checkout-button" onClick={() => void pay()} disabled={checkoutBusy || providerRequest.isLoading || !provider}>{checkoutBusy ? <Spinner size="sm" /> : <LockKeyhole size={17} />}{checkoutBusy ? `Opening ${provider === "paymob" ? "Paymob" : "Stripe"}…` : "Secure checkout"}</button>
        <p className="checkout-note">Stripe charges in USD. Paymob converts the server-verified USD total to EGP before checkout. Downloads unlock after signed payment confirmation.</p>
      </aside>
    </div>}
  </main></div>;
}
