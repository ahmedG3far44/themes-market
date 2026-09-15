import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Mail, MapPin, Clock } from "lucide-react";
import Header from "../components/header";
import { useToast } from "../context/toast-store";

export default function ContactPage() {
  const { notify } = useToast();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Name is required";
    if (!form.email.trim()) next.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Enter a valid email";
    if (!form.message.trim()) next.message = "Message is required";
    else if (form.message.trim().length < 10) next.message = "Message must be at least 10 characters";
    return next;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 700));
    setSending(false);
    setSent(true);
    notify("Message received — we’ll reply within 24 hours (demo).", "success");
    setForm({ name: "", email: "", subject: "", message: "" });
  };

  return (
    <div className="legal-page">
      <Header />
      <main className="legal-main">
        <Link to="/" className="back-link">← Back to home</Link>
        <span className="eyebrow">Get in touch</span>
        <h1>Contact us</h1>
        <p className="legal-updated">Have a question, need a custom theme, or want a refund? We reply within 24 hours.</p>

        <div className="contact-layout">
          <div className="legal-content">
            {sent && (
              <div className="success-message" role="status">
                <span>Thanks — your message was received. We’ll get back to you shortly.</span>
                <button type="button" onClick={() => setSent(false)} aria-label="Dismiss">×</button>
              </div>
            )}

            <h2 style={{ marginTop: sent ? 8 : 6 }}>Send a message</h2>
            <p>For order issues include your order ID and email. For partnership or custom work, describe your stack and timeline.</p>

            <form className="contact-form" onSubmit={onSubmit} noValidate>
              <div className="form-grid">
                <label>
                  Name <span className="field-required">*</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "err-name" : undefined}
                  />
                  {errors.name && <span id="err-name" className="field-error">{errors.name}</span>}
                </label>

                <label>
                  Email <span className="field-required">*</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "err-email" : undefined}
                  />
                  {errors.email && <span id="err-email" className="field-error">{errors.email}</span>}
                </label>

                <label className="full">
                  Subject
                  <input
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="How can we help? (optional)"
                  />
                </label>

                <label className="full">
                  Message <span className="field-required">*</span>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Tell us about your project or question..."
                    rows={6}
                    aria-invalid={!!errors.message}
                    aria-describedby={errors.message ? "err-message" : undefined}
                  />
                  {errors.message && <span id="err-message" className="field-error">{errors.message}</span>}
                </label>
              </div>

              <div className="contact-actions">
                <button type="submit" className="primary-button" disabled={sending}>
                  {sending ? "Sending..." : "Send message"}
                </button>
                <span className="contact-hint">Demo form — no email is sent in this preview.</span>
              </div>
            </form>

            <h2>Related links</h2>
            <ul>
              <li><Link to="/privacy">Privacy Policy</Link> — how we handle your data.</li>
              <li><Link to="/terms">Terms &amp; Conditions</Link> — license and usage.</li>
              <li><Link to="/refund">Refund Policy</Link> — eligibility and timelines.</li>
              <li><Link to="/about">About us</Link> — our story and what’s included.</li>
            </ul>
          </div>

          <aside className="contact-aside" aria-label="Contact information">
            <div className="contact-card">
              <h3>Reach us directly</h3>
              <p><Mail size={16} /> support@portfoliomarket.com</p>
              <p><Clock size={16} /> Response within 24 hours · Sun–Thu</p>
              <p><MapPin size={16} /> Remote — worldwide delivery via Stripe</p>
              <a href="https://linkedin.com/in/ahmedg3far44" target="_blank" rel="noreferrer" className="secondary-button contact-linkedin">
                Message @ahmedG3far44 on LinkedIn
              </a>
            </div>

            <div className="contact-card muted">
              <h3>Before you write</h3>
              <ul>
                <li>Check theme docs: setup & deployment guides on each theme page.</li>
                <li>Include order ID for purchase or download issues.</li>
                <li>For refunds, see <Link to="/refund">refund policy</Link> (7-day window).</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
