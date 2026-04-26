import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "../components/site/Nav";
import { Hero } from "../components/site/Hero";
import { Capabilities } from "../components/site/Capabilities";
import { Architecture } from "../components/site/Architecture";
import { Workflow } from "../components/site/Workflow";
import { CTA } from "../components/site/CTA";
import { Footer } from "../components/site/Footer";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Discoverse AI — Autonomous Agent Platform" },
      {
        name: "description",
        content:
          "OpenClaw-based super agents with E2B sandboxed execution and Weaviate long-term vector memory. True end-to-end automation.",
      },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-dvh bg-background text-foreground antialiased">
      <Nav />
      <main>
        <Hero />
        <Capabilities />
        <Architecture />
        <Workflow />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
