import { compileAllDlcs } from "../src/dlc/compiler";
import { DlcValidationError } from "../src/dlc/schema";

try {
  const catalog = compileAllDlcs({
    dlcRoot: "dlc",
    outDir: "generated/dlc",
    publicDir: "public/dlc",
  });
  console.log(`已编译 ${catalog.length} 个 DLC：`);
  for (const item of catalog) {
    console.log(`- ${item.id} ${item.workTitle} (${item.version})`);
  }
} catch (error) {
  if (error instanceof DlcValidationError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
