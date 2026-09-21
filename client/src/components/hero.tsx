import { Link, useNavigate } from "react-router-dom";
import { useAppAuth } from "../context/auth-store";

// Hero gallery images reserved for future GalleryTheme integration

function HeroSection() {
    const { user } = useAppAuth();
    const isAdmin = user?.role === "admin";
    const isAuthenticated = user !== null;

    return (
        <div className="relative w-full overflow-hidden bg-[#f7f8f6] min-h-screen">
            {/* <GalleryTheme images={HERO_IMAGES} /> */}
            {/* <video autoPlay loop muted playsInline className="blur-[5px] absolute top-0 left-0 w-screen h-screen object-cover z-0" src="/hero-background.mp4"></video> */}
            <HeroHeader isAdmin={isAdmin} isAuthenticated={isAuthenticated} className="absolute top-0 left-0 right-0 z-30" />
            <HeroContent
                title={
                    <>
                        Make a statement
                        <br />
                        <span className="bg-gradient-to-r from-brand via-[#6d64ff] to-[#9d97ff] bg-clip-text text-transparent">with your portfolio</span>
                    </>
                }
                description="Curated portfolio themes for creators, designers and developers. Production-ready templates with clean code, thoughtful interactions and practical guides to launch fast."
                ctaText="Explore Themes"
                ctaHref="/themes"
            />

        </div>
    );
}

export default HeroSection;

export function HeroHeader({
    className,
    isAdmin,
    isAuthenticated,
}: {
    className?: string;
    isAdmin: boolean;
    isAuthenticated: boolean;
}) {
    return (
        <header
            className={`mx-auto flex w-[min(1180px,calc(100%-24px))] items-center justify-between bg-transparent py-5 md:w-[min(1180px,calc(100%-40px))] ${className ?? ""}`}
        >
            <Link
                className="text-[19px] font-[850] tracking-[-0.04em] hover:opacity-80"
                to="/"
            >
                <span className="text-ink">FOLIO</span>
                <span className="text-brand">KIT</span>
            </Link>
            <div className="flex items-center gap-2">
                {!isAuthenticated ? (
                    <>
                        <Link
                            className="hidden sm:inline-flex min-h-9 items-center justify-center rounded-full px-4 text-sm font-semibold text-muted hover:bg-white hover:text-ink transition-colors"
                            to="/sign-in"
                        >
                            Log in
                        </Link>
                        <Link
                            className="inline-flex min-h-9 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-black transition-colors"
                            to="/sign-up"
                        >
                            Sign up
                        </Link>
                    </>
                ) : (
                    <>
                        <Link
                            className="inline-flex min-h-9 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark transition-colors"
                            to={isAdmin ? "/admin" : "/dashboard"}
                        >
                            Dashboard
                        </Link>
                        <Link
                            className="hidden sm:inline-flex min-h-9 items-center justify-center rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-soft transition-colors"
                            to={isAdmin ? "/admin" : "/purchases"}
                        >
                            {isAdmin ? "Manage" : "My Library"}
                        </Link>
                    </>
                )}
            </div>
        </header>
    );
}

export function HeroContent({
    title,
    description,
    ctaText,
    ctaHref,
}: {
    className?: string;
    title: React.ReactNode;
    description: React.ReactNode;
    ctaText: string;
    ctaHref: string;
}) {
    const navigate = useNavigate();
    return (
        <div className="absolute top-1/2 left-1/2 w-[min(860px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex flex-col justify-center items-center gap-6 z-20 text-center">
            <h1 className="text-[clamp(2.8rem,6.5vw,5.25rem)] font-black tracking-[-0.065em] leading-[0.9] text-ink text-balance">
                {title}
            </h1>
            <p className="max-w-[620px] text-[15px] md:text-[18px] leading-[1.7] font-medium text-muted text-balance">
                {description}
            </p>
            <button
                onClick={() => navigate(ctaHref)}
                className="mt-2 inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand px-8 text-[14px] font-extrabold tracking-wide text-white shadow-[0_10px_30px_rgba(99,91,219,0.35)] transition-all hover:bg-brand-dark hover:shadow-[0_14px_36px_rgba(99,91,219,0.42)] hover:scale-[1.02] active:scale-[0.98]"
            >
                {ctaText} <span aria-hidden="true" className="ml-1.5 text-white/90">→</span>
            </button>
        </div>
    );
}


// function GalleryTheme({ images }: { images: string[] }) {
//     return (

//         <section className="bg-red-500 absolute top-0 left-0 w-screen h-screen object-cover z-0 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 p-4 overflow-hidden">

//             {images.map((image, index) => (
//                 <div key={index} className="aspect-square bg-gray-200 rounded-lg overflow-hidden">
//                     <img src={image} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover" />
//                 </div>
//             ))}
//         </section>

//     )
// }