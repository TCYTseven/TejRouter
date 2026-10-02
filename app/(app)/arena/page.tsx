import { ArenaView } from "@/components/arena/arena-view";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Leaderboard",
  description:
    "Rank LLM routers by your own blind votes: ratings with likely ranges, win rates and head-to-head records, computed in your browser.",
  path: "/arena",
});

export default function ArenaPage() {
  return <ArenaView />;
}
