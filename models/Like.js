import mongoose from "mongoose";

const LikeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    songId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Song",
      required: true,
    },
  },
  { timestamps: true }
);

LikeSchema.index({ userId: 1, songId: 1 }, { unique: true });
LikeSchema.index({ songId: 1 });

const Like = mongoose.model("Like", LikeSchema);
export default Like;
