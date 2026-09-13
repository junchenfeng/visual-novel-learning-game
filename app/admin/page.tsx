import { headers } from "next/headers";
import { getAdminPassword } from "../../src/auth/admin";
import { readAdminSession } from "../../src/auth/requestAdmin";
import { loadRoster } from "../../src/roster/store";
import { loadUploadIndex } from "../../src/dlc/uploadIndex";
import { mergePreviewRows, nicknameForUserId } from "../../src/ingest/preview";
import { loadPreviewIndex } from "../../src/ingest/previewIndex";
import { requestOrigin } from "../../src/server/siteUrl";
import { AdminConsole } from "./AdminConsole";
import { AdminLogin } from "./AdminLogin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authed = await readAdminSession();
  if (!authed) {
    return <AdminLogin configured={Boolean(getAdminPassword())} />;
  }
  const headerList = await headers();
  const [packs, previews, poets] = await Promise.all([loadUploadIndex(), loadPreviewIndex(), loadRoster()]);
  const rows = mergePreviewRows(previews, packs).map((row) =>
    row.nickname ? row : { ...row, nickname: nicknameForUserId(row.userId) },
  );
  return <AdminConsole poets={poets} previews={rows} origin={requestOrigin(headerList)} />;
}
