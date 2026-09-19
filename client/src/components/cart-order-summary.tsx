import type { CartType } from "@shared/types";
import { AlertCircle, BadgePercent, CheckCircle2, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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
  const [code, setCode] = useState("");
  const [discountError, setDiscountError] = useState<string | null>(null);

  useEffect(() => {
    if (!discountError) return;
    const timer = window.setTimeout(() => setDiscountError(null), 4500);
    return () => window.clearTimeout(timer);
  }, [discountError]);

  const applyDiscount = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return;
    setDiscountError(null);
    try {
      await cartState.applyDiscount(normalizedCode);
      setCode("");
    } catch (caught) {
      setDiscountError(caught instanceof Error ? caught.message : "This discount code could not be applied");
    }
  };

  const removeDiscount = async () => {
    setDiscountError(null);
    try {
      await cartState.clearDiscount();
    } catch (caught) {
      setDiscountError(caught instanceof Error ? caught.message : "The discount could not be removed");
    }
  };

  const taxCalculated = cart.taxStatus === "estimated";
  const taxLabel = taxCalculated && cart.taxPercentage !== undefined
    ? `Estimated tax (${cart.taxPercentage.toLocaleString(undefined, { maximumFractionDigits: 2 })}%)`
    : "Tax";

  return <aside className="order-summary" aria-labelledby="order-summary-title">
    <div className="order-summary-heading">
      <div><span className="eyebrow">Checkout</span><h2 id="order-summary-title">Order summary</h2></div>
    </div>

    <div className="my-4 ">
      <div className="discount-section-label"><BadgePercent size={16} /><span>Discount code</span></div>
      {cart.discountCode ? <div className="discount-applied">
        <span><CheckCircle2 size={17} /><span><strong>{cart.discountCode}</strong><small>{cart.discountPercentage}% discount applied</small></span></span>
        <button type="button" disabled={checkoutBusy || cartState.isLoading} onClick={() => void removeDiscount()} aria-label="Remove discount"><X size={15} /></button>
      </div> : <form className="discount-form" onSubmit={applyDiscount}>
        <input
          value={code}
          disabled={checkoutBusy || cartState.isLoading}
          onChange={(event) => { setCode(event.target.value.toUpperCase()); setDiscountError(null); }}
          placeholder="Enter code"
          aria-label="Discount code"
          aria-invalid={Boolean(discountError)}
          aria-describedby={discountError ? "discount-error" : undefined}
        />
        <button className="secondary-button" disabled={!code.trim() || cartState.isLoading || checkoutBusy}>{cartState.isLoading ? <Spinner size="sm" /> : "Apply"}</button>
      </form>}
      {discountError && <div className="discount-error" id="discount-error" role="alert">
        <AlertCircle size={16} /><span>{discountError}</span>
        <button type="button" onClick={() => setDiscountError(null)} aria-label="Dismiss discount error"><X size={14} /></button>
      </div>}
    </div>

    <dl className="summary-totals">
      <div><dt>Subtotal</dt><dd>{money(cart.subtotalMinor, cart.currency)}</dd></div>
      {cart.discountMinor > 0 && <div className="discount-row"><dt>Discount</dt><dd>−{money(cart.discountMinor, cart.currency)}</dd></div>}
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

    <p className="checkout-note">Stripe calculates the final tax from your billing address. The checkout total may differ from this location-based estimate.</p>
  </aside>;
}
