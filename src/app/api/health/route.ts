import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "web",
    environment: serverEnv.APP_ENV,
    timestamp: new Date().toISOString(),
    version: serverEnv.SERVICE_VERSION,
  });
}
