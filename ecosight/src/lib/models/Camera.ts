import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICamera extends Document {
  name: string;
  ip: string;
  location: string;
  active: boolean;
  fps: number;
  createdAt: Date;
  updatedAt: Date;
}

const CameraSchema: Schema<ICamera> = new Schema(
  {
    name: { type: String, required: true },
    ip: { type: String, required: true },
    location: { type: String, default: "" },
    active: { type: Boolean, default: true },
    fps: { type: Number, default: 30 },
  },
  { timestamps: true }
);

export const Camera: Model<ICamera> =
  mongoose.models.Camera || mongoose.model<ICamera>("Camera", CameraSchema);
