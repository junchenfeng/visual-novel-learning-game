import { headers } from "next/headers";
import { getAdminPassword } from "../../src/auth/admin";
import { readAdminSession } from "../../src/auth/requestAdmin";
import { POET_ROSTER } from "../../src/dlc/roster";
import { loadUploadIndex } from "../../src/dlc/uploadIndex";
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
  const packs = await loadUploadIndex();
  return <AdminConsole poets={POET_ROSTER} packs={packs} origin={requestOrigin(headerList)} />;
}
