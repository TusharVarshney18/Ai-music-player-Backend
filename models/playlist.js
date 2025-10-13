import mongoose from "mongoose";

const playlistSchema = new mongoose.Schema({
   userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
   },
   name: {
      type: String,
      required: true,
   },
   description: {
      type: String,
      default: "",
   },
   coverUrl: {
      type: String,
      default: "https://res.cloudinary.com/dqwii1yih/image/upload/v1760187900/covers/uufqtjp8ca1aclsp82aa.png",
   },
   tracks: [
      {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Song", // reference to your songs collection
      },
   ],
   createdAt: {
      type: Date,
      default: Date.now,
   },
});

export default mongoose.models.Playlist ||
   mongoose.model("Playlist", playlistSchema);
