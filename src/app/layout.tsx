import type { Metadata } from "next";
import { inter, fontVariables } from "@/app/fonts";
import { Providers } from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "buyer-v2",
  description: "AI-native Florida buyer brokerage",
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
