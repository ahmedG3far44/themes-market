import type { CatalogResponse } from "@shared/types";
import { ArrowRight, BadgeCheck, Layers3, ShieldCheck, Zap } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import Header from "../components/header";
import { ThemeCard } from "../components/theme-card";
import { ErrorMessage } from "../components/ui/error-message";
import { Skeleton } from "../components/ui/skeleton";
import { useAppAuth } from "../context/auth-store";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";

export default function Home() {
  const { user } = useAppAuth();
  const cart = useCart();
  const { data, error, isLoading, run, clearError } = useAsync<CatalogResponse>();

  useEffect(() => {
    void run(api.get<CatalogResponse>("/themes?featured=true&limit=6&sort=popular")).catch(() => undefined);
  }, [run]);

  return <div className="marketing-page">
    <Header />
    <main>
      <section className="market-hero">
        <div>
          <span className="hero-badge"><BadgeCheck size={15} /> Production-ready portfolio templates</span>
          <h1>Launch work that looks unmistakably yours.</h1>
          <p>Curated, polished portfolio themes with clean source code, thoughtful interactions, and practical setup guides.</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/themes">Browse themes <ArrowRight size={18} /></Link>
            {user && user.role !== "admin" && <Link className="secondary-button" to="/purchases">Your library</Link>}
          </div>
          <div className="trust-row"><span><ShieldCheck size={16} /> Secure checkout</span><span><Zap size={16} /> Instant access</span><span><Layers3 size={16} /> Complete source files</span></div>
        </div>
        <div className="hero-composition" aria-hidden="true"><div className="composition-card one"><span>Selected work</span><b>Creative direction<br />meets clean code.</b></div><div className="composition-card two"><i /><i /><i /></div><div className="composition-orbit" /></div>
      </section>
      <section className="featured-themes">
        <div className="section-heading"><div><span className="eyebrow">Editor’s selection</span><h2>Built to make a strong first impression.</h2></div><Link to="/themes">See every theme <ArrowRight size={17} /></Link></div>
        {error && <ErrorMessage message={error} onDismiss={clearError} />}
        {isLoading && !data ? (
          <div className="theme-grid">{[1, 2, 3].map((number) => <Skeleton className="theme-card-skeleton" key={number} />)}</div>
        ) : data?.items.length ? (
          <div className="theme-grid">{data.items.map((theme) => <ThemeCard
            key={theme.id}
            theme={theme}
            inCart={cart.cart?.items.some((item) => item.themeId === theme.id)}
            isAdmin={user?.role === "admin"}
            onAdd={user && user.role !== "admin" ? (id) => void cart.add(id).catch(() => undefined) : undefined}
            adding={cart.isLoading}
          />)}</div>
        ) : <div className="catalog-empty">Featured themes will appear here as soon as an administrator publishes them.</div>}
      </section>
      <section className="market-values">
        <article><span>01</span><h3>Designed with restraint</h3><p>Clear hierarchy, purposeful motion, and typography that lets your work lead.</p></article>
        <article><span>02</span><h3>Ready to customize</h3><p>Organized source code and documentation make each theme easy to adapt.</p></article>
        <article><span>03</span><h3>One-time ownership</h3><p>A simple purchase unlocks the exact version you bought for five secure downloads.</p></article>
      </section>
    </main>
  </div>;
}
