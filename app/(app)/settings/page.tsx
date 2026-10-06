import { ApiKeySettings } from "@/components/settings/api-keys";
import { PageHeader } from "@/components/ui/page-header";
import { PROVIDERS } from "@/lib/providers/registry";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Settings",
  description:
    "Add API keys for the LLM routers you use. Keys are stored only in your browser.",
  path: "/settings",
});

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Settings" description="Add an API key for each router you want to test." />
      <ApiKeySettings providers={PROVIDERS.filter((p) => !p.simulated)} />
    </div>
  );
}
