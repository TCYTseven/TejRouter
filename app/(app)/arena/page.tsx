import { ArenaView } from "@/components/arena/arena-view";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Arena leaderboard",
  description:
    "Human-preference leaderboard for LLM routers from blind playground votes: Bradley-Terry Elo ratings with 95% bootstrap intervals, Wilson win rates, win-probability and head-to-head matrices.",
  path: "/arena",
});

export default function ArenaPage() {
  return <ArenaView />;
}
