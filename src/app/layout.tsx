import type { Metadata } from "next";
import { Inter, Noto_Sans_Tamil } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/components/shared/Providers";
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
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} ${notoTamil.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
