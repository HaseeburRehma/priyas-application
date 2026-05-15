import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Tamil } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/components/shared/Providers";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

// Tamil-script fallback. Latin glyphs come from Inter; Tamil falls through
// to Noto Sans Tamil thanks to the CSS font-family stack in globals.css.
const notoTamil = Noto_Sans_Tamil({
  subsets: ["tamil"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-tamil",
});

export const metadata: Metadata = {
  title: {
    default: "Priya's Reinigungsservice",
    template: "%s · Priya's Reinigungsservice",
  },
  description:
    "Operations platform for Priya's Reinigungsservice — scheduling, time tracking, properties, invoices.",
  robots: { index: false, follow: false }, // private app
  manifest: "/manifest.webmanifest",
  applicationName: "Priya's Reinigungsservice",
  appleWebApp: {
    capable: true,
    title: "Priya's",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", type: "image/svg+xml", sizes: "192x192" },
      { url: "/icons/icon-512.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.svg", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0F766E",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${notoTamil.variable}`}
      // Tell Chrome's built-in Translate to leave the React-owned tree
      // alone. Translate rewrites text nodes in-place, which trips React's
      // diff with "Failed to execute 'removeChild' on 'Node'" the next
      // time the component re-renders. Our app does its own i18n via
      // next-intl, so the browser-level translation is undesirable anyway.
      translate="no"
    >
      {/*
        Next 14's Metadata API emits <link rel="manifest">,
        <meta name="theme-color">, <link rel="apple-touch-icon"> etc.
        from the `metadata` and `viewport` exports above. The extra
        <meta name="mobile-web-app-capable"> tag isn't covered by the
        Metadata API, so it's added explicitly here. The Google "notranslate"
        meta is a belt-and-braces companion to translate="no" on <html>.
      */}
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="google" content="notranslate" />
      </head>
      <body className="notranslate">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
          <ServiceWorkerRegister />
          <OfflineIndicator />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
