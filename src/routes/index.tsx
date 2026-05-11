import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/Dashboard";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Smart Irrigation Dashboard" },
      { name: "description", content: "Live ESP32 sensor readings over Bluetooth with siren alerts." },
    ],
  }),
});