import { useState } from "react";
import { UserButton } from "@clerk/react";
import { NavLink, Outlet } from "react-router-dom";
import { useAppAuth } from "../../context/auth-store";
import { CreditCard, Menu, Users, X, ShoppingBag, LayoutPanelTop, ChartSpline, FileText, MailPlus } from "lucide-react";
import { Logo } from "../header";

const navigation = [
  { to: "/admin", label: "Insights", icon: ChartSpline, end: true },
  { to: "/admin/users", label: "Manage users", icon: Users },
  { to: "/admin/themes", label: "Portfolio themes", icon: LayoutPanelTop },
  { to: "/admin/content", label: "Site content", icon: FileText },
  { to: "/admin/orders", label: "Marketplace orders", icon: ShoppingBag },
  { to: "/admin/promotions", label: "Email promotions", icon: MailPlus },
  { to: "/admin/transactions", label: "Legacy transactions", icon: CreditCard },
];

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { user } = useAppAuth();

  return (
    <div className="admin-shell">
      {open && <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <aside className={`admin-sidebar ${open ? "is-open" : ""}`}>
        <div className="brand-row">
          <Logo />
          <button className="icon-button mobile-only" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <p className="sidebar-label">Administration</p>
        <nav aria-label="Admin navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
              <Icon size={19} aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <UserButton />
          <div><strong>{user?.name}</strong><span>{user?.email}</span></div>
        </div>
      </aside>
      <div className="admin-main">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <span className="brand">PORTFOLIO <b>MARKET</b></span>
          <UserButton />
        </header>
        <Outlet />
      </div>
    </div>
  );
}
