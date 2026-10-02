import { connection } from "next/server";
import { Playground } from "@/components/playground/playground";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Compare",
  description:
    "Send one prompt to several LLM routers and read the answers side by side, with the model each router chose, response time and cost. Then vote for the best answer.",
  path: "/playground",
});

export default async function PlaygroundPage() {
  await connection();
  return <Playground providers={providerStatuses()} />;
}
