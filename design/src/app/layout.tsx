import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Aktion Design", template: "%s · Aktion Design" },
  description:
    "A collaborative, Figma-style design tool powered by the Aktion component runtime.",
};

export const viewport: Viewport = {
  themeColor: "#111214",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
