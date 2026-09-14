import type { ReactNode } from "react";
import { useAuth } from "@clerk/react"
import { Navigate } from "react-router-dom";
import { Spinner } from "./ui/spinner";
import { useAppAuth } from "../context/auth-store";
import { ErrorMessage } from "./ui/error-message";


export default function Protected({ children, adminOnly = false, customerOnly = false }: { children: ReactNode; adminOnly?: boolean; customerOnly?: boolean }) {

    const { isLoaded, isSignedIn } = useAuth()
    const { user, isReady, error } = useAppAuth();


    if (!isLoaded || !isReady) return <div className="page-loader"><Spinner size="md" /></div>

    if (!isSignedIn) return <Navigate to={"/sign-in"} replace />
    if (error) return <main className="centered-state"><ErrorMessage message={error} /></main>
    if (adminOnly && user?.role !== "admin") return <Navigate to="/dashboard" replace />;
    if (customerOnly && user?.role === "admin") return <Navigate to="/" replace />;

    return (
        <>
            {children}
        </>
    )

}
