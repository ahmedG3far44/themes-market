import { Link } from "react-router-dom";
import Header from "../components/header";

export default function AboutPage() {
  return (
    <div className="legal-page">
      <Header />
      <main className="legal-main">
        <Link to="/" className="back-link">← Back to home</Link>
        <span className="eyebrow">Company</span>
        <h1>About Portfolio Market</h1>
        <p className="legal-updated">Crafting themes for portfolios that leave an impression</p>

        <div className="legal-content">
          <p>
            <strong>Portfolio Market</strong> is a curated marketplace for production-ready portfolio themes. We build for designers, developers,
            studios and independent creators who want work that looks unmistakably theirs — without reinventing the basics.
          </p>

          <h2>Our mission</h2>
          <p>
            Great portfolios do three things: load fast, read clearly, and let the work lead. Every theme ships with clean source code,
            thoughtful interactions, responsive layouts and practical documentation so you can launch in hours, not weeks.
          </p>

          <h2>What makes us different</h2>
          <ul>
            <li><strong>Designed with restraint —</strong> clear hierarchy, purposeful motion and typography that doesn’t compete with your work.</li>
            <li><strong>Ready to customize —</strong> organized file structure, reusable components and setup guides for Next.js, React, and headless stacks.</li>
            <li><strong>One purchase, real ownership —</strong> single-portfolio license for the version you bought, with 5 secure downloads and instant delivery after Stripe payment.</li>
          </ul>

          <h2>What’s included</h2>
          <ul>
            <li>Responsive templates with 16:10 and 4:3 preview ratios, gallery lightbox (90vw × 90vh, blurred backdrop), and video walkthroughs.</li>
            <li>Setup & deployment instructions, changelog and free updates for the purchased version.</li>
            <li>Secure payments via Stripe, including Visa, Mastercard, Google Pay, and Apple Pay.</li>
          </ul>

          <h2>By the numbers</h2>
          <div className="about-stats">
            <div><strong>100%</strong><span>Production source code</span></div>
            <div><strong>5</strong><span>Secure downloads per order</span></div>
            <div><strong>24h</strong><span>Support response target</span></div>
          </div>

          <h2>Built by</h2>
          <p>
            Designed and developed by{" "}
            <a href="https://linkedin.com/in/ahmedg3far44" target="_blank" rel="noreferrer">
              @ahmedG3far44
            </a>{" "}
            — full-stack developer focused on marketplace products, checkout flows and delightful UI. Have an idea or need a custom theme?{" "}
            <Link to="/contact">Get in touch</Link>.
          </p>

          <h2>Explore</h2>
          <p>
            Browse the <Link to="/themes">theme library</Link>, read our <Link to="/privacy">privacy policy</Link>,{" "}
            <Link to="/terms">terms</Link> and <Link to="/refund">refund policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
