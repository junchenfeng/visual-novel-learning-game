import { notFound } from "next/navigation";
import { GamePlayer } from "../../../src/components/GamePlayer";
import { loadCompiledDlc } from "../../../src/dlc/loadCompiled";

type PlayPageProps = {
  params: Promise<{ dlcId: string }>;
};

export default async function PlayPage({ params }: PlayPageProps) {
  const { dlcId } = await params;
  const dlc = loadCompiledDlc(dlcId);
  if (!dlc) {
    notFound();
  }
  return <GamePlayer dlc={dlc} />;
}
