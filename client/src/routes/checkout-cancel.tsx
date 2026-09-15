import { XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "../components/header";

export default function CheckoutCancel() {
  return <div className="store-page"><Header /><main className="result-page">
    <XCircle className="result-icon cancel" />
    <h1>Checkout canceled.</h1>
    <p>Nothing was charged. Your selected themes are still in your cart.</p>
    <div><Link className="primary-button" to="/cart">Return to cart</Link><Link className="secondary-button" to="/themes">Keep browsing</Link></div>
  </main></div>;
}
