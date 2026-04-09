import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDetection extends Document {
  binId: mongoose.Types.ObjectId;
  timestamp: Date;
  items: {
    plastic?: number;
    paper?: number;
    metal?: number;
    glass?: number;
    bio_hazards?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DetectionSchema: Schema<IDetection> = new Schema(
  {
    binId: { type: Schema.Types.ObjectId, ref: "Bin", required: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    items: {
      plastic: { type: Number, default: 0 },
      paper: { type: Number, default: 0 },
      metal: { type: Number, default: 0 },
      glass: { type: Number, default: 0 },
      bio_hazards: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const Detection: Model<IDetection> =
  mongoose.models.Detection ||
  mongoose.model<IDetection>("Detection", DetectionSchema);
