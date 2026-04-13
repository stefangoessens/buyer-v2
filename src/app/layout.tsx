import type { Metadata } from "next";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { fontVariables } from "@/app/fonts";
import { Providers } from "@/app/providers";
import { appSurfaceDefinitions } from "@/lib/app-shell";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  ...appSurfaceDefinitions.marketing.metadata,
};

// Swallow errors that bubble up from Chrome extensions (MetaMask,
// Rabby, etc.) so the Next.js dev overlay doesn't block the UI. These
// are noise — the extensions inject scripts into every page and fail
// when they can't find a wallet to connect to. Nothing we ship or
// control can fix them, and they're dev-mode-only since production
// doesn't run the overlay. The handler runs before any React code.
const chromeExtensionErrorSilencer = `
(() => {
  const isExtensionSrc = (src) =>
    typeof src === "string" && src.startsWith("chrome-extension://");
  window.addEventListener(
    "error",
    (event) => {
      if (
        isExtensionSrc(event.filename) ||
        isExtensionSrc(event.error?.stack) ||
        (event.message && /MetaMask|chrome-extension:\\/\\//.test(event.message))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason;
      const stack = typeof reason === "object" && reason ? reason.stack : "";
      const msg = typeof reason === "object" && reason ? reason.message : String(reason);
      if (
        isExtensionSrc(stack) ||
        /MetaMask|chrome-extension:\\/\\//.test(msg ?? "")
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" className={cn("font-sans", geist.variable)}>
        <head>
          <script
            dangerouslySetInnerHTML={{ __html: chromeExtensionErrorSilencer }}
          />
        </head>
        <body className={`${fontVariables} font-sans antialiased`}>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
