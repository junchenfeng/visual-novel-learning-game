import { notFound } from "next/navigation";
import { GamePlayer } from "../../../src/components/GamePlayer";
import { loadCompiledDlc } from "../../../src/dlc/loadCompiled";

type PlayPageProps = {
  params: Promise<{ dlcId: string }>;
};

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: PlayPageProps) {
  const { dlcId } = await params;
  const dlc = await loadCompiledDlc(dlcId);
  if (!dlc) {
    notFound();
  }
  return <GamePlayer dlc={dlc} />;
}
