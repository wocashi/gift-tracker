import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { pin } = await request.json();
  const correctPin = process.env.PIN_CODE;

  if (!correctPin) {
    return NextResponse.json({ error: "PIN_CODE が設定されていません" }, { status: 500 });
  }

  if (pin !== correctPin) {
    return NextResponse.json({ error: "PINが違います" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("pin-auth", "verified", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30日
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("pin-auth");
  return response;
}
