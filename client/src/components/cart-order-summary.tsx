import type { CartType } from "@shared/types";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useCart } from "../context/cart-store";
import { money } from "../lib/format";
import { Spinner } from "./ui/spinner";

interface CartOrderSummaryProps {
  cart: CartType;
  checkoutBusy: boolean;
  onCheckout: () => void;
}

export function CartOrderSummary({ cart, checkoutBusy, onCheckout }: CartOrderSummaryProps) {
  const cartState = useCart();

  const taxCalculated = cart.taxStatus === "estimated";
  const taxLabel = taxCalculated && cart.taxPercentage !== undefined
    ? `Estimated tax (${cart.taxPercentage.toLocaleString(undefined, { maximumFractionDigits: 2 })}%)`
    : "Tax";

  return <aside className="order-summary" aria-labelledby="order-summary-title">
    <div className="order-summary-heading">
      <div><span className="eyebrow">Checkout</span><h2 id="order-summary-title">Order summary</h2></div>
    </div>

    <dl className="summary-totals">
      <div><dt>Subtotal</dt><dd>{money(cart.subtotalMinor, cart.currency)}</dd></div>
      <div className="tax-row"><dt>{taxLabel}<small>Finalized from your billing address</small></dt><dd>{taxCalculated ? money(cart.taxMinor, cart.currency) : "At checkout"}</dd></div>
      <div className="summary-total"><dt>{taxCalculated ? "Estimated total" : "Subtotal before tax"}</dt><dd>{money(cart.totalMinor, cart.currency)}</dd></div>
    </dl>

    <div className="stripe-default">
      <span><ShieldCheck size={18} /></span>
      <div><strong>Secure checkout with Stripe</strong><small>Card and supported wallet options appear securely on Stripe.</small></div>
    </div>

    <button type="button" className="primary-button checkout-button mb-2 " onClick={onCheckout} disabled={checkoutBusy || cartState.isLoading}>
      {checkoutBusy ? <Spinner size="sm" /> : <LockKeyhole size={17} />}
      {checkoutBusy ? "Checkout Processing…" : "Continue to secure checkout"} 
    </button>

    <p className="checkout-note">Stripe applies eligible promotions and calculates final tax from your billing address. The checkout total may differ from this estimate.</p>
  </aside>;
}
