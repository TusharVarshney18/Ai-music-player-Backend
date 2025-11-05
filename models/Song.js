import mongoose from "mongoose";

const SongSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    artist: { type: String, default: "Unknown Artist" },

    // 🔒 Hide these from all API responses by default
    url: { type: String, required: true, select: false },
    publicId: { type: String, required: true, select: false },

    cover: { type: String, default: "" },
    album: { type: String, default: "Singles" },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Song", SongSchema);
