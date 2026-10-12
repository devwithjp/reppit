import "./globals.css";
import "./skin.css";
import type { Metadata, Viewport } from "next";
import { themeScript } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: { default: "reppit: find libraries that are still maintained", template: "%s · reppit" },
  description: "Repos and agent skills scored by how well they are maintained, not by stars. Every downvote names a reason.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
