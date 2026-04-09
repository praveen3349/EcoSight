import { NextResponse, NextRequest } from "next/server";
import dbConnect from "@/lib/db";
import { Bin } from "@/lib/models/Bin";
import { Detection } from "@/lib/models/Detection";

export async function POST(req: NextRequest) {
  try {
    // Basic API Key authentication for the webhook
    const apiSecret = req.headers.get("x-ml-secret");
    if (apiSecret !== process.env.ML_WEBHOOK_SECRET) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { binId, types } = body;

    if (!binId || !types) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    await dbConnect();

    // Verify bin exists
    const bin = await Bin.findById(binId);
    if (!bin) {
      return new NextResponse("Bin not found", { status: 404 });
    }

    // 1. Log the Detection
    await Detection.create({
      binId,
      items: types,
    });

    // 2. Update Bin Counters
    bin.counters.plastic += types.plastic || 0;
    bin.counters.paper += types.paper || 0;
    bin.counters.metal += types.metal || 0;
    bin.counters.glass += types.glass || 0;
    bin.counters.bio_hazards += types.bio_hazards || 0;

    // 3. Calculate Bin Fill status
    const totalItems = 
      bin.counters.plastic + 
      bin.counters.paper + 
      bin.counters.metal + 
      bin.counters.glass + 
      bin.counters.bio_hazards;

    // Determine current fill percentage
    const fillPercentage = (totalItems / bin.maxItemCapacity) * 100;

    if (fillPercentage >= 90) {
      bin.status = "Critical";
    } else if (fillPercentage >= 75) {
      bin.status = "Warning";
    } else {
      bin.status = "Normal";
    }

    // Attempt to estimate days to full
    const now = new Date();
    const msSinceEmptied = now.getTime() - new Date(bin.lastEmptiedAt).getTime();
    const hoursSinceEmptied = msSinceEmptied / (1000 * 60 * 60);

    if (hoursSinceEmptied > 0 && totalItems > 0) {
      // Items per hour
      const rate = totalItems / hoursSinceEmptied;
      const remainingItems = Math.max(0, bin.maxItemCapacity - totalItems);
      // Hours until full
      const hoursToFull = remainingItems / rate;
      // Convert to days
      bin.estimatedDaysToFull = parseFloat((hoursToFull / 24).toFixed(2));
    } else {
      bin.estimatedDaysToFull = null;
    }

    await bin.save();

    return NextResponse.json({ success: true, bin });
  } catch (error) {
    console.error("[WEBHOOK_DETECTIONS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
