import { Show, UserButton } from "@clerk/react";
import { ArrowLeftRight, ChevronDown, LayoutDashboardIcon, LayoutTemplate, LibraryBig, PackageCheck, ReceiptText, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAppAuth } from "../context/auth-store";
import { useCart } from "../context/cart-store";

const libraryLinks = [
  { to: "/purchase", label: "Purchases", description: "Themes you own", icon: PackageCheck },
  { to: "/orders", label: "Orders", description: "Receipts and details", icon: ReceiptText },
  { to: "/transactions", label: "Transactions", description: "Pending payment activity", icon: ArrowLeftRight },
];

function Header() {
  const { count } = useCart();
  const { user } = useAppAuth();

  const location = useLocation();

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [openedAtPath, setOpenedAtPath] = useState(location.pathname);

  const libraryRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const menuOpen = libraryOpen && openedAtPath === location.pathname;

  const libraryActive = location.pathname === "/purchase"
    || location.pathname === "/purchases"
    || location.pathname.startsWith("/orders")
    || location.pathname.startsWith("/transactions");

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!libraryRef.current?.contains(event.target as Node)) setLibraryOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLibraryOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const isHomePage = location.pathname === "/";



  return <header className={`site-header ${isHomePage ? "home-header" : ""}`}>
    <Logo />
    <nav className="main-nav" aria-label="Main navigation">
      <Show when="signed-in">
        {user?.role === "customer" && <div className="customer-nav">

          <NavLink className={({ isActive }) => `customer-nav-link ${isActive ? "active" : ""}`} to="/themes">
            <LayoutTemplate size={17} strokeWidth={1.9} />
            <span>Themes</span>
          </NavLink>

          <div className="library-nav" ref={libraryRef}>
            <button
              ref={triggerRef}
              type="button"
              className={`library-menu-trigger ${libraryActive ? "active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => {
                if (menuOpen) setLibraryOpen(false);
                else {
                  setOpenedAtPath(location.pathname);
                  setLibraryOpen(true);
                }
              }}
            >
              <LibraryBig size={17} strokeWidth={1.9} />
              <span>Library</span>
              <ChevronDown className={menuOpen ? "is-open" : ""} size={14} />
            </button>

            <div className={`header-library-menu ${menuOpen ? "is-open" : ""}`} role="menu" aria-hidden={!menuOpen}>
              <div className="header-library-menu-label">Your account</div>
              {libraryLinks.map(({ to, label, description, icon: Icon }) => <NavLink
                key={to}
                to={to}
                role="menuitem"
                tabIndex={menuOpen ? 0 : -1}
                className={({ isActive }) => isActive ? "active" : ""}
                onClick={() => setLibraryOpen(false)}
              >
                <span className="header-library-menu-icon"><Icon size={17} strokeWidth={1.9} /></span>
                <span><strong>{label}</strong><small>{description}</small></span>
              </NavLink>)}
            </div>
          </div>
        </div>}
        {user?.role === "admin" && <Link className="nav-admin-link" to="/admin">
          <span>
            <LayoutDashboardIcon size={18} />
          </span>
          <span>Dashboard</span>
        </Link>}
      </Show>
    </nav>

    <div className="auth-actions">
      <Show when="signed-out">
        <Link className="text-button" to="/sign-in">Sign in</Link>
        <Link className="primary-button small" to="/sign-up">Create account</Link>
      </Show>

      <Show when="signed-in">
        <UserButton />
        {user?.role !== "admin" && <Link className="cart-link" to="/cart" aria-label={`Cart with ${count} items`}><ShoppingBag size={19} />{count > 0 && <span>{count}</span>}</Link>}
      </Show>
    </div>
  </header>;
}

export default Header;



export function Logo() {
  return (<Link className="brand" to="/">FOLIO <span>KIT</span></Link>)
}
