import { Link } from "react-router-dom";
import { Show, UserButton } from "@clerk/react";
import { useCart } from "../context/cart-store";
import { useAppAuth } from "../context/auth-store";
import { LayoutDashboardIcon, LayoutTemplate, Library, ShoppingBag } from "lucide-react";

function Header() {
    const { count } = useCart(); const { user } = useAppAuth();
    return (
        <header className="site-header">

            <Link className="brand" to="/">PORTFOLIO <span>MARKET</span></Link>

            <nav className="main-nav">
                <Show when="signed-in">
                    {user?.role === "customer" && <div className="space-x-4 flex">
                        <Link className="text-sm font-bold flex space-x-2" to="/purchases"><span><Library size={18} /> </span><span>Purchases</span></Link>
                        <Link className="text-sm font-bold flex space-x-2" to="/themes"><span><LayoutTemplate size={18} /></span><span>Themes</span></Link>
                    </div>}
                    {user?.role === "admin" && <Link className="text-sm font-bold flex space-x-2" to="/admin"><span><LayoutDashboardIcon size={18} /></span><span>Dashboard</span></Link>}
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
        </header>
    )
}

export default Header;
