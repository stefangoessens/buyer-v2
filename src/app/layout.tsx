import type { Metadata } from "next";
import { inter, fontVariables } from "@/app/fonts";
import { Providers } from "@/app/providers";
import { appSurfaceDefinitions } from "@/lib/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  ...appSurfaceDefinitions.marketing.metadata,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${fontVariables} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
