import mongoose from "mongoose";

const SongSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    artist: {
      type: String,
      default: "Unknown Artist",
      trim: true,
    },
    album: {
      type: String,
      default: "Singles",
      trim: true,
    },
    cover: {
      type: String, // URL for song cover (Cloudinary image)
      default: "",
    },
    url: {
      type: String, // direct Cloudinary URL (public)
      required: true,
    },
    publicId: {
      type: String, // still useful for deleting/updating on Cloudinary
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    duration: {
      type: Number, // optional — store track length (seconds)
      default: 0,
    },
    genre: {
      type: String,
      default: "Unknown",
    },
    plays: {
      type: Number,
      default: 0,
    },
    likes: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Optional: auto-increment play count
SongSchema.methods.incrementPlays = async function () {
  this.plays += 1;
  await this.save();
};

const Song = mongoose.model("Song", SongSchema);
export default Song;
