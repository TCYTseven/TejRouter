import type { ComponentType } from "react";
import {
  IconBook,
  IconFlask,
  IconLayout,
  IconList,
  IconServer,
  IconTerminal,
  IconTrophy,
  type IconProps,
} from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: ComponentType<IconProps>;
  /** Single-key shortcut shown in the command palette ("g" then key). */
  key: string;
}

/** Primary app navigation. Pages built by other agents are linked here too. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", description: "Router status and latest results", icon: IconLayout, key: "d" },
  { href: "/playground", label: "Playground", description: "Race one prompt across routers", icon: IconTerminal, key: "p" },
  { href: "/benchmarks", label: "Benchmarks", description: "Run graded suites with statistics", icon: IconFlask, key: "b" },
  { href: "/runs", label: "Runs", description: "Saved benchmark runs and reports", icon: IconList, key: "r" },
  { href: "/arena", label: "Arena", description: "Leaderboard from your blind votes", icon: IconTrophy, key: "a" },
  { href: "/providers", label: "Providers", description: "Keys, models and health checks", icon: IconServer, key: "v" },
  { href: "/methodology", label: "Methodology", description: "How the numbers are computed", icon: IconBook, key: "m" },
];

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
