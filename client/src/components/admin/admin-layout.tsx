import { BarChart3, CreditCard, Menu, Percent, Palette, Users, X } from "lucide-react";
import { UserButton } from "@clerk/react";
import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { useAppAuth } from "../../context/auth-store";

const navigation = [
  { to: "/admin", label: "Insights", icon: BarChart3, end: true },
  { to: "/admin/users", label: "Manage users", icon: Users },
  { to: "/admin/themes", label: "Portfolio themes", icon: Palette },
  { to: "/admin/orders", label: "Marketplace orders", icon: CreditCard },
  { to: "/admin/discounts", label: "Discounts", icon: Percent },
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
          <NavLink className="brand" to="/">PORTFOLIO <span>MARKET</span></NavLink>
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
