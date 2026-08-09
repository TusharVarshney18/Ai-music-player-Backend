import express from "express";
import mongoose from "mongoose";
import Like from "../models/Like.js";
import Song from "../models/Song.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// ✅ Get current user's liked songs (populated)
router.get("/mine", authMiddleware, async (req, res) => {
  try {
    const likes = await Like.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate({ path: "songId", populate: { path: "uploadedBy", select: "username displayName" } });

    const songs = likes.map((l) => l.songId).filter(Boolean);
    res.json({ songs, likedIds: likes.map((l) => l.songId?._id?.toString()) });
  } catch (err) {
    console.error("Get liked songs error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Like a song
router.post("/:id", authMiddleware, async (req, res) => {
  try {
    const songId = req.params.id;
    if (!mongoose.isValidObjectId(songId)) return res.status(400).json({ error: "Invalid song id" });

    const song = await Song.findById(songId);
    if (!song) return res.status(404).json({ error: "Song not found" });

    const existing = await Like.findOne({ userId: req.user.id, songId });
    if (!existing) {
      await Like.create({ userId: req.user.id, songId });
      song.likesCount += 1;
      song.likes += 1;
      await song.save();
    }

    res.json({ liked: true });
  } catch (err) {
    console.error("Like error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Unlike a song
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const songId = req.params.id;
    if (!mongoose.isValidObjectId(songId)) return res.status(400).json({ error: "Invalid song id" });

    const deleted = await Like.findOneAndDelete({ userId: req.user.id, songId });
    if (deleted) {
      await Song.updateOne({ _id: songId }, { $inc: { likesCount: -1, likes: -1 } });
    }

    res.json({ liked: false });
  } catch (err) {
    console.error("Unlike error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
