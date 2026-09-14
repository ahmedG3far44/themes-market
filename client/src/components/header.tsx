import { Show, UserButton } from "@clerk/react";
import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useCart } from "../context/cart-store";
import { useAppAuth } from "../context/auth-store";

function Header() {
    const { count } = useCart(); const { user } = useAppAuth();
    return (
        <header className="site-header">
            <Link className="brand" to="/">PORTFOLIO <span>MARKET</span></Link>
            <nav className="main-nav"><Link to="/themes">Themes</Link><Show when="signed-in">{user?.role === "customer" && <Link to="/purchases">Purchases</Link>}{user?.role === "admin" && <Link to="/admin">Admin</Link>}</Show></nav>
            <div className="auth-actions">
                {user?.role !== "admin" && <Link className="cart-link" to="/cart" aria-label={`Cart with ${count} items`}><ShoppingBag size={19} />{count > 0 && <span>{count}</span>}</Link>}
                <Show when="signed-out">
                    <Link className="text-button" to="/sign-in">Sign in</Link>
                    <Link className="primary-button small" to="/sign-up">Create account</Link>
                </Show>
                <Show when="signed-in">
                    <UserButton />
                </Show>
            </div>
        </header>
    )
}

export default Header;
