import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema POS",
  description: "Sistema de ventas POS",
  icons: {
    icon: "/icono.ico",
    apple: "/icono.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
