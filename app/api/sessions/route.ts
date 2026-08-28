import { NextRequest, NextResponse } from "next/server";
import { recordedSessionSchema } from "../../../src/sessions/recordedSession";
import { writeRecordedSession } from "../../../src/sessions/writeRecordedSession";

function sessionSaveEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SAVE_SESSIONS === "1";
}

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = recordedSessionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "会话记录不完整" }, { status: 400 });
  }

  if (!sessionSaveEnabled()) {
    return NextResponse.json({ saved: false, reason: "disabled" });
  }

  try {
    const written = writeRecordedSession(parsed.data);
    return NextResponse.json({
      saved: true,
      id: parsed.data.id,
      dlcId: parsed.data.dlcId,
      dlcVersion: parsed.data.dlcVersion,
      file: written.filePath,
    });
  } catch (error) {
    return NextResponse.json(
      { saved: false, error: error instanceof Error ? error.message : "写入失败" },
      { status: 500 },
    );
  }
}
