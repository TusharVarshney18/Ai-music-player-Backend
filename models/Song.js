import mongoose from "mongoose";

const SongSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    artist: { type: String, default: "Unknown Artist" },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    cover: { type: String, default: "" },
    album: { type: String, default: "Singles" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    backupUrl: { type: String, default: "" }, // ✅ backup field
  },
  { timestamps: true }
);

const Song = mongoose.model("Song", SongSchema);
export default Song; // ✅ must be default
