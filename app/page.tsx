import { buildCatalogPoets } from "../src/dlc/catalog";
import { loadCompiledCatalog } from "../src/dlc/loadCompiled";
import { PoetCatalog } from "../src/components/PoetCatalog";

export default function HomePage() {
  const poets = buildCatalogPoets(loadCompiledCatalog());
  return <PoetCatalog poets={poets} />;
}
