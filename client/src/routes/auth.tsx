import { Link } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/react";

export function SignInPage() { return <main className="auth-page"><Link className="brand" to="/">PORTFOLIO <span>MARKET</span></Link><div><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/purchases" /></div></main>; }
export function SignUpPage() { return <main className="auth-page"><Link className="brand" to="/">PORTFOLIO <span>MARKET</span></Link><div><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/themes" /></div></main>; }
