import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import dbConnect from "@/lib/db";
import { Camera } from "@/lib/models/Camera";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    await dbConnect();
    const cameras = await Camera.find({}).sort({ createdAt: -1 });
    return NextResponse.json(cameras);
  } catch (error) {
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    const role = (sessionClaims?.metadata as any)?.role;
    if (role !== "admin") return new NextResponse("Forbidden", { status: 403 });
    await dbConnect();
    const body = await req.json();
    const camera = await Camera.create(body);
    return NextResponse.json(camera, { status: 201 });
  } catch (error) {
    return new NextResponse("Internal Error", { status: 500 });
  }
}
