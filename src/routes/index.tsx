import { createFileRoute } from "@tanstack/react-router";
import { TimelineApp } from "@/components/tl/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <TimelineApp />;
}
