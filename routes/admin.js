import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Song from "../models/Song.js";
import authMiddleware from "../middleware/auth.js";
import requireRole from "../middleware/requireRole.js";

const router = express.Router();

router.use(authMiddleware, requireRole("admin"));

// ✅ List users (paginated, searchable)
router.get("/users", async (req, res) => {
  try {
    const { q = "", page = 1, limit = 20 } = req.query;
    const query = q
      ? { $or: [{ username: { $regex: q, $options: "i" } }, { email: { $regex: q, $options: "i" } }, { displayName: { $regex: q, $options: "i" } }] }
      : {};

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page, 10) - 1) * parseInt(limit, 10))
      .limit(parseInt(limit, 10))
      .select("username displayName email avatarUrl roles createdAt failedLoginAttempts");

    res.json({ users, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error("Admin list users error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Update a user's role
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid user id" });
    if (id === req.user.id) return res.status(400).json({ error: "You cannot change your own role" });

    const { roles } = req.body;
    if (!Array.isArray(roles) || roles.length === 0) return res.status(400).json({ error: "Roles must be a non-empty array" });

    const valid = ["user", "admin"];
    const cleaned = [...new Set(roles.filter((r) => valid.includes(r)))];
    if (!cleaned.length) return res.status(400).json({ error: "Invalid roles" });

    const user = await User.findByIdAndUpdate(id, { roles: cleaned }, { new: true }).select("username roles");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Role updated", user });
  } catch (err) {
    console.error("Admin role update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Delete a user (and their songs)
router.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid user id" });
    if (id === req.user.id) return res.status(400).json({ error: "You cannot delete your own account" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });

    await Song.deleteMany({ uploadedBy: id });
    await user.deleteOne();

    res.json({ message: "User and their songs deleted" });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Delete any song (moderation)
router.delete("/songs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid song id" });

    const song = await Song.findById(id);
    if (!song) return res.status(404).json({ error: "Song not found" });

    try {
      const cloudinary = (await import("../config/cloudinary.js")).default;
      await cloudinary.uploader.destroy(song.publicId, { resource_type: "video" });
    } catch (err) {
      console.warn("Cloudinary delete failed:", err.message);
    }

    await song.deleteOne();
    res.json({ message: "Song deleted" });
  } catch (err) {
    console.error("Admin delete song error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
