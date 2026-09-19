import { Link } from "react-router-dom";
import { RefreshCw, ServerCrash } from "lucide-react";

import Header from "../../components/header";

interface ErrorStateProps {
    message: string;
    title?: string;
    onRetry?: () => void;
    retryLabel?: string;
    backTo?: string;
    backLabel?: string;
}

export function ErrorState({
    message,
    title = "Something went wrong",
    onRetry,
    retryLabel = "Try again",
    backTo,
    backLabel = "Go back",
}: ErrorStateProps) {
    return (
        <div className="min-h-screen">
            <Header />
            <div
                role="alert"
                className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-start mt-40 px-6 py-16 text-center"
            >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#bb3e4a]/10">
                    <ServerCrash size={26} className="text-red-500" strokeWidth={1.75} />
                </span>

                <h2 className="mt-5 text-lg font-semibold">{title}</h2>

                <p className="mt-2 text-[15px] leading-relaxed text-zinc-500 ">
                    {message}
                </p>
 
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="inline-flex items-center gap-2 rounded-full bg-[var(--brand,#635bdb)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-dark,#4c44c6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand,#635bdb)]"
                        >
                            <RefreshCw size={15} strokeWidth={2} />
                            {retryLabel}
                        </button>
                    )}

                    {backTo && (
                        <Link
                            to={backTo}
                            className="inline-flex items-center justify-center rounded-full border border-[var(--line,#e2e7e3)] bg-[var(--surface,#ffffff)] px-5 py-2.5 text-sm font-medium text-[var(--ink,#18201d)] transition-colors hover:bg-[var(--soft,#f2f5f2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand,#635bdb)]"
                        >
                            {backLabel}
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}