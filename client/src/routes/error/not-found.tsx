import { Link, useNavigate } from "react-router-dom";

export default function NotFoundPage() {
    const navigate = useNavigate();

    return (
        <main className="flex min-h-screen flex-col items-center justify-center">
            <div className="flex flex-col items-center text-center">


                <div className="w-96  flex items-center justify-center overflow-hidden">
                    <img className="mix-blend-multiply scale-y-110 scale-x-110 " src="./404.jpg" alt="404" />
                </div>

                <p className="mt-6 text-lg font-medium `">
                    This page wandered off somewhere.
                </p>
                <p className="mt-2 max-w-3/4 text-xs leading-relaxed ">
                    We couldn't find the page you were looking for. It may have been moved,
                    renamed, or never existed.
                </p>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Link
                        to="/"
                        className="primary-button"
                    >
                        Back to Home
                    </Link>
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="secondary-button"
                    >
                        Back to Previous
                    </button>
                </div>
            </div>
        </main>
    );
}
