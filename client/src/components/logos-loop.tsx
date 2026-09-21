const TOOLS = [
  { name: "React", slug: "react" },
  { name: "Next.js", slug: "nextdotjs" },
  { name: "Vue.js", slug: "vuedotjs" },
  { name: "Svelte", slug: "svelte" },
  { name: "Astro", slug: "astro" },
  { name: "Tailwind CSS", slug: "tailwindcss" },
  { name: "GSAP", slug: "greensock" },
  { name: "Framer", slug: "framer" },
  { name: "Webflow", slug: "webflow" },
  { name: "TypeScript", slug: "typescript" },
  { name: "Node.js", slug: "nodedotjs" },
  { name: "Vite", slug: "vite" },
];

function LogoItem({ name, slug }: { name: string; slug: string }) {
  return (
    <div
      className="flex flex-shrink-0 items-center gap-3 px-10 opacity-60 grayscale transition-opacity duration-300 hover:opacity-100"
      title={name}
    >
      <img
        src={`https://cdn.simpleicons.org/${slug}/000000`}
        alt={name}
        className="h-8 w-8 object-contain md:h-9 md:w-9"
        loading="lazy"
        draggable={false}
      />
      <span className="whitespace-nowrap text-sm font-medium tracking-wide text-black md:text-base">
        {name}
      </span>
    </div>
  );
}

export default function LogoMarquee() {
  // Duplicate the list so the track can loop seamlessly at -50%.
  const track = [...TOOLS, ...TOOLS];

  return (
    <div className="w-full bg-background py-8">
      <div className="relative w-full overflow-hidden">
        {/* Fade edges so logos don't pop in/out abruptly */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent md:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent md:w-32" />

        <div className="flex w-max animate-marquee">
          {track.map((tool, i) => (
            <LogoItem key={`${tool.slug}-${i}`} name={tool.name} slug={tool.slug} />
          ))}
        </div>
      </div>

      {/* Scoped keyframes: slow, linear, infinite, seamless loop */}
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
