import { themePreview } from "../lib/theme-media";
import type { ThemeType } from "@shared/types";
import { CheckCircle2, Download, ShoppingBag, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeMedia } from "./theme-media";
import { money } from "../lib/format";

interface ThemeCardProps {
  theme: ThemeType;
  inCart?: boolean;
  isAdmin?: boolean;
  onAdd?: (id: string) => void;
  adding?: boolean;
}

export function ThemeCard({ theme, inCart = false, isAdmin = false, onAdd, adding = false }: ThemeCardProps) {

  const purchaseAction = theme.purchased ? (
    <Link className="secondary-button" to="/purchases"><Download size={16} />Download</Link>
  ) : inCart ? (
    <Link className="secondary-button" to="/cart"><ShoppingCart size={16} />View cart</Link>
  ) : isAdmin ? null : theme.canPurchase === false ? (
    <button className="secondary-button" disabled title="Download package coming soon"><ShoppingBag size={16} />Coming soon</button>
  ) : onAdd ? (
    <button className="secondary-button" disabled={adding} onClick={() => onAdd(theme.id)}><ShoppingBag size={16} />Add to cart</button>
  ) : (
    <Link className="secondary-button" to="/sign-in"><ShoppingBag size={16} />Add to cart</Link>
  );

  return <article className="theme-card">

    <Link className="theme-card-visual" to={`/themes/${theme.slug}`} aria-label={`View ${theme.name}`}>
      <ThemeMedia asset={themePreview(theme)} alt={`Preview of ${theme.name}`} preview />
    </Link>

    <div className="theme-card-body">
      <div className="theme-card-meta">

        <div>
          {theme.stack.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
          <p className="text-xs my-2">{theme.shortDescription}</p>
        </div>

        {theme.purchased && <span className="owned-label"><CheckCircle2 size={13} />Owned</span>}
      </div>

      <h3> <Link className="theme-card-title" to={`/themes/${theme.slug}`}>{theme.name}</Link></h3>

      <div className="theme-card-footer">
        <strong>{money(theme.priceMinor, theme.currency)}</strong>
        {purchaseAction}
      </div>
    </div>
  </article>;
}
