import { themePreview } from "../lib/theme-media";
import type { ThemeType } from "@shared/types";
import { Download, LoaderCircle, ShoppingBag, ShoppingCart } from "lucide-react";
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
    <Link className="secondary-button theme-card-action" to="/purchases" aria-label={`Download ${theme.name}`}><Download size={16} />Download</Link>
  ) : inCart ? (
    <Link className="secondary-button theme-card-action" to="/cart"><ShoppingCart size={16} />View cart</Link>
  ) : isAdmin ? null : theme.canPurchase === false ? (
    <button className="secondary-button theme-card-action" type="button" disabled title="Download package coming soon"><ShoppingBag size={16} />Coming soon</button>
  ) : onAdd ? (
    <button className="secondary-button theme-card-action" type="button" disabled={adding} aria-busy={adding} onClick={() => onAdd(theme.id)}>
      {adding ? <LoaderCircle className="theme-card-loading" size={16} /> : <ShoppingBag size={16} />}
      {adding ? "Adding…" : "Add to cart"}
    </button>
  ) : (
    <Link className="secondary-button theme-card-action" to="/sign-in"><ShoppingBag size={16} />Add to cart</Link>
  );

  void theme.stack;

  return <article className="theme-card">

    <Link className="theme-card-visual" to={`/themes/${theme.slug}`} aria-label={`View ${theme.name}`}>
    
      <ThemeMedia asset={themePreview(theme)} alt={`Preview of ${theme.name}`} preview />
      {/* <span className="theme-card-view-label" aria-hidden="true">View theme <ArrowUpRight size={15} /></span> */}

      {/* {(theme.featured || theme.purchased) && <span className="theme-card-badges" aria-hidden="true">
        {theme.featured && <span className="theme-card-badge"><Sparkles size={13} />Featured</span>}
        {theme.purchased && <span className="theme-card-badge owned"><CheckCircle2 size={13} />Owned</span>}
      </span>} */}
    </Link>

    <div className="theme-card-body">
      {/* <ul className="theme-card-tags" aria-label="Technology stack">
        {visibleStack.map((item) => <li key={item}>{item}</li>)}
        {remainingStackCount > 0 && <li title={theme.stack.slice(3).join(", ")}>+{remainingStackCount}</li>}
      </ul> */}

      <h3><Link className="theme-card-title" to={`/themes/${theme.slug}`}>{theme.name}</Link></h3>
      {/* <p className="theme-card-description">{theme.shortDescription}</p> */}

      <div className="theme-card-footer">
        
        <div className="theme-card-price">
          {/* <span>One-time price</span> */}
          <strong>{money(theme.priceMinor, theme.currency)}</strong>
        </div>

        {purchaseAction}
      </div>
    </div>
  </article>;
}
