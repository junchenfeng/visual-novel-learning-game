import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST, GET } from "../app/api/ingest/route";
import { IngestQueue } from "../src/ingest/queue";
import { L2_STUDENT_BY_ID } from "../src/ingest/l2Students";
import { itWithSqlite } from "./helpers/sqlite";

let dir: string;
const ids = Array.from(L2_STUDENT_BY_ID.keys());
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(),"ingest-api-"));
  process.env.INGEST_DATA_DIR=dir; process.env.INGEST_ASYNC_ENABLED="1";
});
afterEach(() => { delete process.env.INGEST_DATA_DIR; delete process.env.INGEST_ASYNC_ENABLED; rmSync(dir,{recursive:true,force:true}); });
itWithSqlite("returns 202 without running review, and exposes the owned final verdict via polling",async () => {
  const res=await POST(new NextRequest("http://localhost/api/ingest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:`hh${ids[0]}`,poetId:"sushi",workTitle:"demo",zipBase64:Buffer.from("zip").toString("base64")})}));
  expect(res.status).toBe(202);
  const job=await res.json(); expect(job.status).toBe("queued"); expect(job.verdict).toBeUndefined();
  const q=new IngestQueue(dir);q.claim();q.finish(job.jobId,{verdict:"skip",issues:[],playUrl:"https://poem.aibeaver.cn/play/demo"},null,{queueMs:1});q.close();
  const status=await GET(new NextRequest(`http://localhost/api/ingest?userId=hh_${ids[0]}&jobId=${job.jobId}`));
  expect(status.status).toBe(200);expect((await status.json()).result.verdict).toBe("skip");
  const other=await GET(new NextRequest(`http://localhost/api/ingest?userId=hh_${ids[1]}&jobId=${job.jobId}`));
  expect(other.status).toBe(404);
});
