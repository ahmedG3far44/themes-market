import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SiteContentType } from "@shared/types";
import { api } from "../lib/api";

export default function Footer() {
  const year = new Date().getFullYear();
  const [socials, setSocials] = useState<SiteContentType["socials"]>({
    instagram: "",
    tiktok: "",
    youtube: "",
    linkedin: "",
  });

  useEffect(() => {
    api.get<SiteContentType>("/content").then((data) => {
      if (data?.socials) setSocials({
        instagram: data.socials.instagram ?? "",
        tiktok: data.socials.tiktok ?? "",
        youtube: data.socials.youtube ?? "",
        linkedin: data.socials.linkedin,
      });
    }).catch(() => undefined);
  }, []);

  return (
    <footer className="site-footer" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="site-footer-inner">
        <div className="footer-grid">
          {/* Brand + description + socials */}
          <div className="footer-brand-col">
            <Link className="brand" to="/">PORTFOLIO <span>MARKET</span></Link>
            <p className="footer-desc">
              Curated portfolio themes for creators, designers and developers. Production-ready templates with clean code, thoughtful interactions and practical guides to launch fast.
            </p>
            <div className="footer-socials" aria-label="Social media">


              <>
                <Link to={socials ? socials.instagram : "#"} target="_blank" rel="noreferrer" aria-label="Instagram">
                  <img src="./instagram.png" width={20} height={20} />
                </Link>

                <Link to={socials ? socials.youtube : "#"} target="_blank" rel="noreferrer" aria-label="YouTube Shorts">
                  <img src="./youtube-shorts.png" width={20} height={20} />
                </Link>
                <Link to={socials ? socials.tiktok : "#"} target="_blank" rel="noreferrer" aria-label="Tiktok">
                  <img src="./tiktok.png" width={20} height={20} />
                </Link>
              </>

            </div>
          </div>

          {/* Explore */}
          <nav className="footer-nav" aria-label="Explore">
            <h3>Explore</h3>
            <Link to="/themes">Themes</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact us</Link>
          </nav>

          {/* Legal */}
          <nav className="footer-nav" aria-label="Legal">
            <h3>Legal</h3>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/refund">Refund Policy</Link>
          </nav>

          {/* Payments */}
          <div className="footer-payments">
            <h3>Payments</h3>
            <p>Secure checkout powered by Stripe. All transactions encrypted.</p>
            <div className="payment-groups">
              <div className="payment-provider-block">

                <div className="payment-badges" aria-label="Stripe payment methods">
                  <span className="pay-badge" title="Visa"> <img src="./visa.png" width={20} height={20} /></span>
                  <span className="pay-badge" title="Mastercard"> <img src="./mastercard.png" width={20} height={20} /></span>
                  <span className="pay-badge" title="Google Pay"> <img src="./google.png" width={20} height={20} /> </span>
                  <span className="pay-badge" title="Apple Pay"> <img src="./apple.png" width={20} height={20} /> </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {year} Portfolio Market. All rights reserved.</span>
          <span className="footer-dot" aria-hidden="true">·</span>
          <span>
            Developed by{" "}
            <Link to={"https://linkedin.com/in/ahmedg3far44"} target="_blank" rel="noreferrer">
              @ahmedG3far44
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
