import type { ComponentType } from "react";
import { IconFlask, IconList, IconServer, IconSliders, IconTerminal, IconTrophy, type IconProps } from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: ComponentType<IconProps>;
  /** Single-key shortcut shown in the command palette ("g" then key). */
  key: string;
}

/** Primary app navigation (docs/DESIGN.md). Methodology lives in the sidebar footer. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/playground", label: "Compare", description: "Send one prompt to several routers", icon: IconTerminal, key: "c" },
  { href: "/benchmarks", label: "Benchmark", description: "Score routers on graded tasks", icon: IconFlask, key: "b" },
  { href: "/runs", label: "Results", description: "Your benchmark reports", icon: IconList, key: "r" },
  { href: "/arena", label: "Leaderboard", description: "Rankings from your blind votes", icon: IconTrophy, key: "l" },
  { href: "/providers", label: "Routers", description: "Connect routers and check them", icon: IconServer, key: "o" },
  { href: "/settings", label: "Settings", description: "API keys, saved only in this browser", icon: IconSliders, key: "s" },
];

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
