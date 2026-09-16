import type { Metadata } from "next";

/**
 * Public privacy policy linked from the App Store listing.
 *
 * Apple's App Review team rejects any submission whose Privacy Policy
 * URL 404s or hides behind auth. This page is intentionally exempt
 * from the auth middleware (see publicRoutes in
 * src/lib/constants/routes.ts) and depends on nothing beyond React
 * and inline styles.
 *
 * The content is a plain‑language GDPR‑style disclosure — what the
 * mobile app collects, why, where it's stored, and how users can
 * exercise their rights. German first (product market), English
 * second (App Review's likely locale).
 *
 * If legal counsel wants stricter wording, override the CONTENT
 * constants below.
 */

const SUPPORT_EMAIL = "dev@tylotech.de";
const CONTROLLER_NAME = "TyloTech — Priya’s Reinigungsservice";
const LAST_UPDATED = "2026-09-16";

export const metadata: Metadata = {
  title: "Datenschutz · Privacy",
  description:
    "Datenschutzerklärung für die Priya's Reinigungsservice App. Privacy policy for the Priya's mobile app.",
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
    maxWidth: 820,
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
    fontSize: 15,
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
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 12px",
    color: "#0F3C54",
  },
  h3: {
    fontSize: 15,
    fontWeight: 700,
    margin: "16px 0 6px",
    color: "#0F3C54",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  p: { fontSize: 14.5, lineHeight: 1.65, color: "#0F3C54", margin: "0 0 10px" },
  ul: {
    fontSize: 14.5,
    lineHeight: 1.65,
    color: "#0F3C54",
    margin: "0 0 12px",
    paddingLeft: 20,
  },
  langLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: "#8BB06B",
    marginBottom: 6,
  },
  link: {
    color: "#5D8E3F",
    fontWeight: 600,
    textDecoration: "underline",
  },
  footer: {
    marginTop: 40,
    fontSize: 13,
    color: "#8BB06B",
    textAlign: "center" as const,
  },
  meta: {
    fontSize: 12,
    color: "#8BB06B",
    marginTop: 4,
  },
};

export default function PrivacyPage() {
  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <span style={styles.eyebrow}>Priya&apos;s Reinigungsservice</span>
        <h1 style={styles.h1}>Datenschutz · Privacy</h1>
        <p style={styles.lead}>
          Was die App speichert, wofür, und wie du deine Rechte ausübst. What
          the app stores, why, and how you exercise your rights.
        </p>
        <p style={styles.meta}>
          Stand / Last updated: {LAST_UPDATED} · Verantwortlich / Controller:{" "}
          {CONTROLLER_NAME}
        </p>

        <section style={{ ...styles.card, marginTop: 24 }}>
          <div style={styles.langLabel}>Deutsch</div>
          <h2 style={styles.h2}>Datenschutzerklärung</h2>

          <h3 style={styles.h3}>1. Welche Daten werden verarbeitet?</h3>
          <ul style={styles.ul}>
            <li>
              <strong>Kontodaten:</strong> Name, E‑Mail, Rolle,
              Sprach‑Einstellung.
            </li>
            <li>
              <strong>Arbeitszeiten:</strong> Ein‑ und Auschecken an
              Kundenobjekten mit Zeitstempel und ausgewähltem Objekt.
            </li>
            <li>
              <strong>Standort (nur mit Einwilligung):</strong> Ungefähre
              GPS‑Position beim Einchecken, um die Anwesenheit am zugewiesenen
              Objekt zu verifizieren. Wird nicht kontinuierlich erfasst.
            </li>
            <li>
              <strong>Fotos:</strong> Vom Nutzer freiwillig aufgenommene
              Bilder für Schadensmeldungen oder Profilbild.
            </li>
            <li>
              <strong>Technische Daten:</strong> Gerätesprache, App‑Version
              und Fehler‑Logs zur Fehlerbehebung.
            </li>
          </ul>

          <h3 style={styles.h3}>2. Wozu werden sie verwendet?</h3>
          <p style={styles.p}>
            Ausschließlich zum Betrieb der App: Schichtplanung,
            Zeiterfassung, Kunden‑ und Objektverwaltung, Rechnungsstellung,
            Team‑Chat, Urlaubs‑ und Schulungs­verwaltung. Keine Werbung, kein
            Verkauf an Dritte, kein Tracking über die App hinaus.
          </p>

          <h3 style={styles.h3}>3. Wer verarbeitet die Daten?</h3>
          <ul style={styles.ul}>
            <li>
              <strong>Supabase</strong> (Datenbank, Authentifizierung,
              Dateispeicher). Auftragsverarbeiter mit AV‑Vertrag.
            </li>
            <li>
              <strong>Vercel</strong> (Hosting der Web‑App).
            </li>
            <li>
              <strong>Apple / Google</strong> (Push‑Benachrichtigungen,
              nur wenn aktiviert).
            </li>
          </ul>

          <h3 style={styles.h3}>4. Deine Rechte</h3>
          <p style={styles.p}>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung,
            Einschränkung und Datenübertragbarkeit gemäß DSGVO. Kontakt für
            Auskünfte und Löschanfragen:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={styles.link}>
              {SUPPORT_EMAIL}
            </a>
            . Eine Beschwerde ist bei der zuständigen Aufsichts­behörde
            möglich.
          </p>

          <h3 style={styles.h3}>5. Aufbewahrung</h3>
          <p style={styles.p}>
            Arbeits­zeit­daten werden gemäß gesetzlicher Aufbewahrungspflichten
            gespeichert. Konto­daten werden bei Kündigung des Arbeits­verhält­nisses
            gelöscht, spätestens jedoch nach Ablauf der gesetzlichen Fristen.
          </p>
        </section>

        <section style={styles.card}>
          <div style={styles.langLabel}>English</div>
          <h2 style={styles.h2}>Privacy Policy</h2>

          <h3 style={styles.h3}>1. What data we process</h3>
          <ul style={styles.ul}>
            <li>
              <strong>Account data:</strong> name, email, role, language
              preference.
            </li>
            <li>
              <strong>Work hours:</strong> check‑in and check‑out events at
              customer properties, with timestamp and property.
            </li>
            <li>
              <strong>Location (opt‑in only):</strong> approximate GPS at
              check‑in, to verify presence at the assigned property. Not
              tracked continuously.
            </li>
            <li>
              <strong>Photos:</strong> images the user voluntarily takes for
              damage reports or profile picture.
            </li>
            <li>
              <strong>Technical data:</strong> device language, app version,
              error logs for troubleshooting.
            </li>
          </ul>

          <h3 style={styles.h3}>2. Purpose</h3>
          <p style={styles.p}>
            Solely to operate the app: shift planning, time tracking,
            customer & property management, invoicing, team chat, vacation
            and training records. No advertising, no sale to third parties,
            no cross‑app tracking.
          </p>

          <h3 style={styles.h3}>3. Sub‑processors</h3>
          <ul style={styles.ul}>
            <li>
              <strong>Supabase</strong> — database, authentication, file
              storage. GDPR data‑processing agreement in place.
            </li>
            <li>
              <strong>Vercel</strong> — web app hosting.
            </li>
            <li>
              <strong>Apple / Google</strong> — push notifications, only when
              enabled by the user.
            </li>
          </ul>

          <h3 style={styles.h3}>4. Your rights</h3>
          <p style={styles.p}>
            Right of access, rectification, erasure, restriction, and data
            portability under GDPR. For requests and deletions, email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={styles.link}>
              {SUPPORT_EMAIL}
            </a>
            . You may also lodge a complaint with your local data‑protection
            authority.
          </p>

          <h3 style={styles.h3}>5. Retention</h3>
          <p style={styles.p}>
            Working‑hours data is retained per statutory retention
            obligations. Account data is deleted upon termination of the
            employment relationship, and no later than the end of applicable
            statutory periods.
          </p>
        </section>

        <p style={styles.footer}>
          <a href="/support" style={styles.link}>
            Support &amp; Kontakt
          </a>
        </p>
      </div>
    </main>
  );
}
