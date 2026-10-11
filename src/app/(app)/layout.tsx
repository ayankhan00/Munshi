import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import AppShell from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={{ name: user.name, email: user.email, theme: user.theme }}>
      {children}
    </AppShell>
  );
}
