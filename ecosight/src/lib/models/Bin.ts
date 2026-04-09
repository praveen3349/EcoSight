import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBin extends Document {
  name: string;
  location: string;
  maxItemCapacity: number;
  status: "Normal" | "Warning" | "Critical";
  counters: {
    plastic: number;
    paper: number;
    metal: number;
    glass: number;
    bio_hazards: number;
  };
  lastEmptiedAt: Date;
  estimatedDaysToFull: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const BinSchema: Schema<IBin> = new Schema(
  {
    name: { type: String, required: true },
    location: { type: String, required: true },
    maxItemCapacity: { type: Number, required: true, default: 1000 },
    status: {
      type: String,
      enum: ["Normal", "Warning", "Critical"],
      default: "Normal",
    },
    counters: {
      plastic: { type: Number, default: 0 },
      paper: { type: Number, default: 0 },
      metal: { type: Number, default: 0 },
      glass: { type: Number, default: 0 },
      bio_hazards: { type: Number, default: 0 },
    },
    lastEmptiedAt: { type: Date, default: Date.now },
    estimatedDaysToFull: { type: Number, default: null },
  },
  {
    timestamps: true,
  }
);

export const Bin: Model<IBin> =
  mongoose.models.Bin || mongoose.model<IBin>("Bin", BinSchema);
