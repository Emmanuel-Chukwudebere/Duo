import { RoomShell } from "@/components/shell/RoomShell";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = code.toLowerCase();

  return <RoomShell code={normalized} />;
}
