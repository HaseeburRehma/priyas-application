import type { Metadata } from "next";

/**
 * Public support landing page linked from the App Store listing.
 * Apple's App Review team clicks this URL during submission review;
 * a 404 or auth-gated page is one of the top rejection reasons.
 *
 * Kept intentionally simple and dependency-free (no NextIntlClient
 * requirement here) so it renders even before locale detection.
 * German copy is primary (product's home market); the second column
 * carries the English text so an Apple reviewer without German can
 * still verify the contact channel is real.
 */

const SUPPORT_EMAIL = "dev@tylotech.de";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Hilfe und Kontakt für Nutzer der Priya's Reinigungsservice App. Support and contact for users of the Priya's mobile app.",
  robots: { index: true, follow: false },
};

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #F6FAF3 0%, #FFFFFF 60%)",
    color: "#0F3C54",
    fontFamily:
      "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "48px 24px 96px",
  },
  container: {
    maxWidth: 780,
    margin: "0 auto",
  },
  eyebrow: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#E1EECF",
    color: "#487030",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
  },
  h1: {
    fontSize: 40,
    fontWeight: 800,
    letterSpacing: -1,
    margin: "16px 0 8px",
    color: "#0F3C54",
  },
  lead: {
    fontSize: 17,
    lineHeight: 1.55,
    color: "#5D8E3F",
    margin: "0 0 32px",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 1px 3px rgba(15, 60, 84, .06), 0 8px 32px rgba(15, 60, 84, .04)",
    border: "1px solid #E5EEF3",
    marginBottom: 20,
  },
  h2: {
    fontSize: 20,
    fontWeight: 700,
    margin: "0 0 12px",
    color: "#0F3C54",
  },
  p: { fontSize: 15, lineHeight: 1.6, color: "#0F3C54", margin: "0 0 12px" },
  link: {
    color: "#5D8E3F",
    fontWeight: 600,
    textDecoration: "underline",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginTop: 16,
  } as React.CSSProperties,
  langLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: "#8BB06B",
    marginBottom: 6,
  },
  footer: {
    marginTop: 40,
    fontSize: 13,
    color: "#8BB06B",
    textAlign: "center" as const,
  },
};

export default function SupportPage() {
  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <span style={styles.eyebrow}>Priya&apos;s Reinigungsservice</span>
        <h1 style={styles.h1}>Support</h1>
        <p style={styles.lead}>
          Hilfe rund um die Priya&apos;s App für Schichten, Zeiterfassung,
          Kunden und Rechnungen.
        </p>

        <section style={styles.card}>
          <div style={styles.grid}>
            <div>
              <div style={styles.langLabel}>Deutsch</div>
              <h2 style={styles.h2}>Kontakt</h2>
              <p style={styles.p}>
                Bei Fragen, Fehlern oder Wünschen zur App schreib uns
                jederzeit eine E‑Mail. Wir antworten in der Regel binnen
                eines Arbeitstages.
              </p>
              <p style={styles.p}>
                <strong>E‑Mail:</strong>{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} style={styles.link}>
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </div>
            <div>
              <div style={styles.langLabel}>English</div>
              <h2 style={styles.h2}>Contact</h2>
              <p style={styles.p}>
                For questions, bugs, or feature requests about the app,
                email us at any time. Typical response within one working
                day.
              </p>
              <p style={styles.p}>
                <strong>Email:</strong>{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} style={styles.link}>
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </div>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.grid}>
            <div>
              <div style={styles.langLabel}>Deutsch</div>
              <h2 style={styles.h2}>Häufige Themen</h2>
              <ul style={{ ...styles.p, paddingLeft: 20 }}>
                <li>Anmeldung und Passwort zurücksetzen</li>
                <li>Zeiterfassung: Ein‑/Auschecken am Objekt</li>
                <li>Urlaub beantragen</li>
                <li>Schaden melden mit Kamera</li>
                <li>Rechnungen und Alltagshilfe‑Berichte</li>
              </ul>
            </div>
            <div>
              <div style={styles.langLabel}>English</div>
              <h2 style={styles.h2}>Common Topics</h2>
              <ul style={{ ...styles.p, paddingLeft: 20 }}>
                <li>Sign‑in and password reset</li>
                <li>Time tracking: check‑in / check‑out at properties</li>
                <li>Requesting vacation</li>
                <li>Reporting damage with the camera</li>
                <li>Invoices and Alltagshilfe monthly reports</li>
              </ul>
            </div>
          </div>
        </section>

        <p style={styles.footer}>
          <a href="/privacy" style={styles.link}>
            Datenschutz / Privacy
          </a>
        </p>
      </div>
    </main>
  );
}
