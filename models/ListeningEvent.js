import mongoose from "mongoose";

const ListeningEventSchema = new mongoose.Schema(
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
    durationSec: {
      type: Number,
      default: 0, // seconds actually listened
    },
  },
  { timestamps: { createdAt: "listenedAt", updatedAt: false } }
);

ListeningEventSchema.index({ userId: 1, listenedAt: -1 });
ListeningEventSchema.index({ songId: 1 });

const ListeningEvent = mongoose.model("ListeningEvent", ListeningEventSchema);
export default ListeningEvent;
