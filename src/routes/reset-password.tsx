import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set new password — Coding Intuition" },
      { name: "description", content: "Choose a new password for your account." },
      { property: "og:title", content: "Set new password — Coding Intuition" },
      { property: "og:description", content: "Choose a new password for your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  }
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={save} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-2xl font-bold">New password</h1>
        <Input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button type="submit" className="w-full">Save</Button>
      </form>
    </main>
  );
}
