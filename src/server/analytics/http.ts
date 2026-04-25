import { NextResponse } from "next/server";
import { ZodError } from "zod";

export async function analyticsJson<T>(load: () => Promise<T>) {
  try {
    return NextResponse.json(await load());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid dashboard query parameters.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unexpected analytics error.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
