import mongoose from "mongoose";

const SongSchema = new mongoose.Schema(
   {
      title: { type: String, required: true },
      artist: { type: String, default: "Unknown Artist" },
      url: { type: String, required: true }, // Cloudinary link
      publicId: { type: String, required: true }, // Cloudinary ID for deletion
      cover: { type: String, default: "" }, // optional song cover image
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // reference uploader
   },
   { timestamps: true }
);

const Song = mongoose.model("Song", SongSchema);
export default Song;
