import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Discoverse AI — Autonomous Agent Platform" },
      { name: "description", content: "Discoverse AI is an OpenClaw-based autonomous agent platform with E2B sandboxed execution and Weaviate long-term vector memory." },
      { name: "author", content: "Discoverse AI" },
      { property: "og:title", content: "Discoverse AI — Autonomous Agent Platform" },
      { property: "og:description", content: "Discoverse AI is an OpenClaw-based autonomous agent platform with E2B sandboxed execution and Weaviate long-term vector memory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Discoverse AI — Autonomous Agent Platform" },
      { name: "twitter:description", content: "Discoverse AI is an OpenClaw-based autonomous agent platform with E2B sandboxed execution and Weaviate long-term vector memory." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/14883008-93c5-4e82-a5c0-ac07a4d5c73e/id-preview-98134d1c--4f282aec-b9a8-4b66-ac4a-32e964bf352e.lovable.app-1777207820487.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/14883008-93c5-4e82-a5c0-ac07a4d5c73e/id-preview-98134d1c--4f282aec-b9a8-4b66-ac4a-32e964bf352e.lovable.app-1777207820487.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
