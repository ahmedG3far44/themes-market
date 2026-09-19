
import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";


if (typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
}

export interface PortraitItem {
    /** Image URL. Square / portrait crops look best. */
    src: string;
    /** Optional caption, e.g. a name. */
    name?: string;
    /** Optional secondary caption, e.g. a role. */
    role?: string;
    /** Optional alt text override (defaults to `name` or a generic label). */
    alt?: string;
}

export interface ScrollPortraitWallProps {
    /** Main sticky hero title. */
    title?: React.ReactNode;
    /** Small line under the title. */
    desc?: React.ReactNode;
    /**
     * The images to scatter across the wall. Accepts either:
     * - a plain array of URL strings, or
     * - an array of `PortraitItem` objects (for captions).
     */
    images: string[] | PortraitItem[];
    /** Columns on large screens (auto-reduced to 3 on `sm` and 2 on mobile). */
    columns?: number;
    /** Show the name / role caption under each portrait. Default `false` — only shown if items carry captions. */
    showCaptions?: boolean;
    className?: string;
}

/** Normalizes `string[] | PortraitItem[]` into `PortraitItem[]`. */
function normalizeItems(images: string[] | PortraitItem[]): PortraitItem[] {
    return images.map((item, i) =>
        typeof item === "string"
            ? { src: item, alt: `Portrait ${i + 1}` }
            : { alt: `Portrait ${i + 1}`, ...item },
    );
}

/* Deterministic placement so SSR and client agree (no Math.random):
 * one portrait per row, with every third row holding a second one,
 * columns walked in a scattered pattern. Returns a grid of item
 * indices (or -1 for an empty cell). */
function buildLayout(count: number, cols: number): number[][] {
    const rows: number[][] = [];
    let i = 0;
    let r = 0;
    while (i < count) {
        const row = new Array<number>(cols).fill(-1);
        const a = (r * 2 + (r % 2)) % cols;
        row[a] = i++;
        if (r % 3 === 0 && i < count) {
            let b = (a + 2) % cols;
            if (b === a) b = (a + 1) % cols;
            row[b] = i++;
        }
        rows.push(row);
        r++;
    }
    return rows;
}

/* Keep portraits a usable size: cap the desired column count on smaller
 * viewports. Starts from `desired` so the SSR markup matches the first
 * client render, then narrows after mount. */
function useResponsiveColumns(desired: number): number {
    const [cols, setCols] = React.useState(desired);

    React.useEffect(() => {
        const sm = window.matchMedia("(min-width: 640px)");
        const lg = window.matchMedia("(min-width: 1024px)");
        const update = () => {
            if (lg.matches) setCols(desired);
            else if (sm.matches) setCols(Math.min(desired, 3));
            else setCols(Math.min(desired, 2));
        };
        update();
        sm.addEventListener("change", update);
        lg.addEventListener("change", update);
        return () => {
            sm.removeEventListener("change", update);
            lg.removeEventListener("change", update);
        };
    }, [desired]);

    return cols;
}

export function ScrollPortraitWall({
    title = "Gallery",
    desc,
    images,
    columns = 4,
    showCaptions = false,
    className,
}: ScrollPortraitWallProps) {
    const root = React.useRef<HTMLElement | null>(null);
    const cols = useResponsiveColumns(Math.max(1, columns));

    const items = React.useMemo(() => normalizeItems(images), [images]);
    const layout = React.useMemo(
        () => buildLayout(items.length, cols),
        [items.length, cols],
    );

    useGSAP(
        () => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const titleFill = root.current?.querySelector<HTMLElement>(".spw-title-fill");
            const reveals = root.current?.querySelectorAll<HTMLElement>(
                ".spw-hero-description, .spw-hero-actions",
            );

            if (!titleFill || !reveals) return;

            if (reduce) {
                gsap.set(titleFill, { clipPath: "inset(0 0% 0 0)" });
                gsap.set(reveals, { autoAlpha: 1, y: 0 });
                return;
            }

            gsap.timeline({ defaults: { ease: "power3.out" } })
                .set(titleFill, { clipPath: "inset(0 100% 0 0)", willChange: "clip-path" })
                .set(reveals, { autoAlpha: 0, y: 14 })
                .to(titleFill, {
                    clipPath: "inset(0 0% 0 0)",
                    duration: 1.15,
                    ease: "power3.inOut",
                    clearProps: "willChange",
                })
                .to(reveals, {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.65,
                    stagger: 0.12,
                }, "-=0.38");
        },
        { scope: root },
    );

    useGSAP(
        () => {
            const reduce = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
            ).matches;
            const nodes = gsap.utils.toArray<HTMLElement>(".spw-item");

            if (reduce) {
                gsap.set(nodes, { scale: 1 });
                return;
            }

            // Each portrait scrubs scale 0 → 1 → 0 across its full pass through the
            // viewport: it grows in from its transform-origin corner, peaks at
            // centre, then shrinks away — "comes and goes".
            nodes.forEach((el) => {
                gsap
                    .timeline({
                        scrollTrigger: {
                            trigger: el,
                            start: "top bottom",
                            end: "bottom top",
                            scrub: true,
                        },
                    })
                    .fromTo(
                        el,
                        { scale: 0 },
                        { scale: 1, ease: "power2.out", duration: 0.5 },
                    )
                    .to(el, { scale: 0, ease: "power2.in", duration: 0.5 });
            });
        },
        { scope: root, dependencies: [cols, items.length], revertOnUpdate: true },
    );

    return (
        <section
            ref={root}
            aria-label={typeof title === "string" ? title : undefined}
            className={[className].filter(Boolean).join(" ")}
        >
            <div className="spw-hero-copy">
                <h1 className="spw-hero-title">
                    <span className="spw-title-base">{title}</span>
                    <span className="spw-title-fill" aria-hidden="true">{title}</span>
                </h1>
                {desc && (
                    <p className="spw-hero-description">
                        {desc}
                    </p>
                )}

                <div className="spw-hero-actions">
                    <Link className="primary-button spw-primary-cta" to="/themes">Explore themes <ArrowRight size={17} /></Link>
                    <a className="secondary-button spw-secondary-cta" href="#featured-themes">View featured themes</a>
                </div>
            </div>

            {/* The scattered portrait grid */}
            <div className="spw-grid">
                {layout.map((row, ri) => (
                    <div key={ri} className="flex w-full">
                        {row.map((idx, ci) => {
                            if (idx === -1)
                                return <div key={ci} className="aspect-square flex-1" />;

                            const item = items[idx];
                            const origin = ci < cols / 2 ? "right bottom" : "left bottom";
                            const hasCaption = showCaptions && (item.name || item.role);

                            return (
                                <div key={ci} className="aspect-square flex-1">
                                    <div
                                        className="spw-item relative h-full w-full"
                                        style={{ transformOrigin: origin, transform: "scale(0)" }}
                                    >
                                        <img
                                            src={item.src}
                                            alt={item.alt ?? item.name ?? `Portrait ${idx + 1}`}
                                            loading="lazy"
                                            decoding="async"
                                            draggable={false}
                                            className="h-full w-full object-cover rounded-lg border border-line contrast-[1.15] filter transition-transform duration-500 ease-in-out hover:scale-95"
                                        />
                                        {hasCaption && (
                                            <div className="spw-caption absolute -bottom-2 left-0 flex w-full translate-y-full justify-between gap-2 text-[11px] uppercase leading-tight sm:text-sm">
                                                {item.name && (
                                                    <span className="truncate">{item.name}</span>
                                                )}
                                                {item.role && (
                                                    <span className="shrink-0">({item.role})</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </section>
    );
}

export default ScrollPortraitWall;
