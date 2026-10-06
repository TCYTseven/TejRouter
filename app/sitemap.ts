import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/playground", priority: 0.9, changeFrequency: "weekly" },
  { path: "/benchmarks", priority: 0.8, changeFrequency: "weekly" },
  { path: "/runs", priority: 0.6, changeFrequency: "daily" },
  { path: "/arena", priority: 0.7, changeFrequency: "daily" },
  { path: "/providers", priority: 0.7, changeFrequency: "weekly" },
  { path: "/methodology", priority: 0.8, changeFrequency: "monthly" },
  { path: "/settings", priority: 0.5, changeFrequency: "monthly" },
  { path: "/onboarding", priority: 0.6, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path === "/" ? "" : r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
