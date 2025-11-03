import mongoose from "mongoose";

const SongSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    artist: { type: String, default: "Unknown Artist" },

    // ✅ CRITICAL: Hide these fields by default
    url: {
      type: String,
      required: true,
      select: false, //
    },
    publicId: {
      type: String,
      required: true,
      select: false, //
    },

    cover: { type: String, default: "" }, // Public - OK to expose
    album: { type: String, default: "Singles" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// ✅ Optional: Add index for faster queries
SongSchema.index({ title: 1, artist: 1, album: 1 });

// ✅ Optional: Add virtual field to check if song is streamable
SongSchema.virtual("isStreamable").get(function () {
  return !!this.url;
});

const Song = mongoose.model("Song", SongSchema);
export default Song;
