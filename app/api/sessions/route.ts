import { NextRequest, NextResponse } from "next/server";
import { recordedSessionSchema } from "../../../src/sessions/recordedSession";
import { writeRecordedSession } from "../../../src/sessions/writeRecordedSession";
import { readUsername } from "../../../src/auth/requestUser";
import { getPoemStore, userSessionKey } from "../../../src/server/poemStore";

function localSessionSaveEnabled() {
  return process.env.NODE_ENV !== "production";
}

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = recordedSessionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "会话记录不完整" }, { status: 400 });
  }

  const username = await readUsername();
  let ossFile: string | undefined;
  if (username) {
    const key = userSessionKey(username, parsed.data.id);
    await getPoemStore().writeJson(key, parsed.data);
    ossFile = key;
  }

  if (!localSessionSaveEnabled() && !username) {
    return NextResponse.json({ saved: false, reason: "disabled" });
  }

  try {
    const written = localSessionSaveEnabled()
      ? writeRecordedSession(parsed.data)
      : { filePath: ossFile ?? "", latestPath: ossFile ?? "" };
    return NextResponse.json({
      saved: true,
      id: parsed.data.id,
      dlcId: parsed.data.dlcId,
      dlcVersion: parsed.data.dlcVersion,
      file: written.filePath,
      store: ossFile,
    });
  } catch (error) {
    return NextResponse.json(
      { saved: false, error: error instanceof Error ? error.message : "写入失败" },
      { status: 500 },
    );
  }
}
