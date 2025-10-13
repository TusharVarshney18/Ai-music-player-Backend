import express from "express";
import authMiddleware from "../middleware/auth.js";
import Songs from "../models/Song.js";
import Playlist from "../models/playlist.js";

const router = express.Router();

// ✅ Create playlist
router.post("/", authMiddleware, async (req, res) => {
   try {
      const { name, description, coverUrl } = req.body;
      if (!name) return res.status(400).json({ error: "Name required" });

      const playlist = await Playlist.create({
         userId: req.user.id,
         name,
         description,
         coverUrl,
         tracks: [], // ✅ match schema
      });

      res.status(201).json({ message: "Playlist created", playlist });
   } catch (err) {
      console.error("Create playlist error:", err);
      res.status(500).json({ error: "Server error" });
   }
});

// ✅ Add song to playlist
router.post("/:id/add", authMiddleware, async (req, res) => {
   try {
      const { songId } = req.body;

      const playlist = await Playlist.findOne({
         _id: req.params.id,
         userId: req.user.id, // ✅ correct field
      });
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });

      const song = await Songs.findById(songId);
      if (!song) return res.status(404).json({ error: "Song not found" });

      // ✅ use playlist.tracks instead of songs
      if (!playlist.tracks.includes(songId)) {
         playlist.tracks.push(songId);
         await playlist.save();
      }

      res.json({ message: "Song added to playlist", playlist });
   } catch (err) {
      console.error("Add song error:", err);
      res.status(500).json({ error: "Server error" });
   }
});

// ✅ Remove song from playlist
router.post("/:id/remove", authMiddleware, async (req, res) => {
   try {
      const { songId } = req.body;

      const playlist = await Playlist.findOne({
         _id: req.params.id,
         userId: req.user.id,
      });
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });

      playlist.tracks = playlist.tracks.filter(
         (track) => track.toString() !== songId
      );
      await playlist.save();

      res.json({ message: "Song removed", playlist });
   } catch (err) {
      console.error("Remove song error:", err);
      res.status(500).json({ error: "Server error" });
   }
});

// ✅ Get all playlists for current user
router.get("/mine", authMiddleware, async (req, res) => {
   try {
      const playlists = await Playlist.find({ userId: req.user.id }).populate(
         "tracks"
      );
      res.json({ playlists });
   } catch (err) {
      console.error("Get playlists error:", err);
      res.status(500).json({ error: "Server error" });
   }
});

// ✅ Delete playlist
router.delete("/:id", authMiddleware, async (req, res) => {
   try {
      const playlist = await Playlist.findOneAndDelete({
         _id: req.params.id,
         userId: req.user.id,
      });
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });
      res.json({ message: "Playlist deleted" });
   } catch (err) {
      console.error("Delete playlist error:", err);
      res.status(500).json({ error: "Server error" });
   }
});

export default router;
