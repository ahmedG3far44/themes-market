import Header from "./header";
import LogoMarquee from "./logos-loop";
import ScrollPortraitWall from "./scroll-wall";

function HeroSection() {
    // const url = "/download.jpg"
    // const bg = {
    //     backgroundImage: `url('${url}')`,
    //     backgroundSize: "cover",
    //     backgroundPosition: "center",
    //     backgroundRepeat: "no-repeat",
    //     backgroundAttachment: "fixed",
    //     // backgroundSize: "100%",
    //     // backgroundAttachment: "fixed",
    //     // backgroundSize: "100%",
    //     // backgroundAttachment: "fixed",
    //     // backgroundSize: "100%",
    //     // backgroundAttachment: "fixed",
    //     // backgroundSize: "100%",
        
    // }
    return (
        <div  className="home-hero-shell bg-brand">
            <Header />
            <ScrollPortraitWallCaptionedDemo />
            <LogoMarquee />
        </div>
    ); 
}

export default HeroSection


const imageUrls: string[] = [
    "https://cdn.dribbble.com/userupload/45774776/file/1077723fbc87a103a345d73c31eb9a36.jpg?resize=752x963&vertical=center",
    "https://cdn.dribbble.com/userupload/45243588/file/30770b9c794cfabd2b5c584502041ac9.jpg?resize=752x705&vertical=center",
    "https://cdn.dribbble.com/userupload/45256980/file/ad82bf29b9b6fc30a86542ee01179953.jpg?resize=752x705&vertical=center",
    "https://cdn.dribbble.com/userupload/45900434/file/fc999f992c7aacd4eafe69cc712c0931.jpg?resize=752x598&vertical=center",
    "https://cdn.dribbble.com/userupload/45375776/file/613ad97c3541c5a9beedb14dcc669e5e.jpg?resize=752x705&vertical=center",
    "https://cdn.dribbble.com/userupload/45478342/file/b92a1a497305190daf7a3b32d4d559ed.jpg?resize=752x543&vertical=center",
    "https://cdn.dribbble.com/userupload/45403626/file/a68b1280bff10ec1f228d461b083d09d.jpg?resize=752x543&vertical=center",
    "https://cdn.dribbble.com/userupload/45256980/file/ad82bf29b9b6fc30a86542ee01179953.jpg?resize=752x705&vertical=center",
    "https://i.pinimg.com/1200x/c3/f9/aa/c3f9aa223d97cdfb75175d48f896ce9a.jpg",
    "https://i.pinimg.com/736x/0f/ce/25/0fce254b55096ac2e67277012c3f504b.jpg",
    "https://i.pinimg.com/736x/ae/39/20/ae39204fa9c63eaa4c56de3c8f4f3840.jpg",
    "https://i.pinimg.com/736x/61/96/fc/6196fcb0cdaad75c82f3559f4bcb7a3d.jpg",
    "https://cdn.dribbble.com/userupload/45256980/file/ad82bf29b9b6fc30a86542ee01179953.jpg?resize=752x705&vertical=center",
    "https://i.pinimg.com/1200x/c3/f9/aa/c3f9aa223d97cdfb75175d48f896ce9a.jpg",
    "https://i.pinimg.com/736x/0f/ce/25/0fce254b55096ac2e67277012c3f504b.jpg",
    "https://i.pinimg.com/736x/ae/39/20/ae39204fa9c63eaa4c56de3c8f4f3840.jpg",
    "https://i.pinimg.com/736x/61/96/fc/6196fcb0cdaad75c82f3559f4bcb7a3d.jpg",
];

export function ScrollPortraitWallCaptionedDemo() {
    const speakers = [
        { src: imageUrls[0], name: "Editorial", role: "Portfolio theme" },
        { src: imageUrls[1], name: "Studio", role: "Creative theme" },
        { src: imageUrls[2], name: "Monograph", role: "Personal theme" },
        { src: imageUrls[3], name: "Canvas", role: "Designer theme" },
        { src: imageUrls[4], name: "Archive", role: "Case-study theme" },
        { src: imageUrls[5], name: "Frame", role: "Photography theme" },
        { src: imageUrls[6], name: "Signal", role: "Developer theme" },
        { src: imageUrls[7], name: "Index", role: "Minimal theme" },
    ];
    return (
        <ScrollPortraitWall
            title="Make your work impossible to overlook."
            desc="Launch a polished portfolio with production-ready themes built for designers, developers, photographers, and creative studios."
            images={speakers}
            showCaptions
        />

    );
}
