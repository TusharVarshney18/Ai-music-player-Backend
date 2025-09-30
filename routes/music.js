import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// Multer config: allow only audio files, max 15 MB
const upload = multer({
   storage: multer.memoryStorage(),
   limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per song
   fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith("audio/")) {
         return cb(new Error("Only audio files are allowed"));
      }
      cb(null, true);
   },
});

// 🎵 Upload song
router.post(
   "/upload",
   authMiddleware,
   (req, res, next) => {
      upload.single("song")(req, res, (err) => {
         if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
               return res.status(413).json({ error: "File too large. Max size is 15MB" });
            }
            return res.status(400).json({ error: err.message });
         }
         next();
      });
   },
   async (req, res) => {
      try {
         if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
         }

         const user = await User.findById(req.user.id);
         if (!user) return res.status(404).json({ error: "User not found" });

         // ✅ Upload to Cloudinary
         const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
               {
                  resource_type: "video", // needed for audio
                  folder: "songs",
               },
               (error, result) => {
                  if (error) {
                     console.error("Cloudinary error:", error);
                     reject(new Error("Cloudinary upload failed"));
                  } else {
                     resolve(result);
                  }
               }
            );
            stream.end(req.file.buffer);
         });

         // ✅ Add song entry to user
         const newSong = {
            title: req.body.title || req.file.originalname,
            artist: req.body.artist || "Unknown Artist",
            url: result.secure_url,
            publicId: result.public_id,
         };

         user.songs.push(newSong);
         await user.save();

         return res.json({
            message: "Song uploaded successfully",
            song: newSong,
            songs: user.songs,
         });
      } catch (err) {
         console.error("Song upload error:", err);
         return res.status(500).json({ error: err.message || "Upload failed" });
      }
   }
);

// 🎵 Get all songs of logged-in user
router.get("/", authMiddleware, async (req, res) => {
   try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      return res.json({ songs: user.songs });
   } catch (err) {
      console.error("Fetch songs error:", err);
      return res.status(500).json({ error: "Failed to fetch songs" });
   }
});

// 🎵 Delete a song
router.delete("/:publicId", authMiddleware, async (req, res) => {
   try {
      const { publicId } = req.params;
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      // Delete from Cloudinary
      try {
         await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
      } catch (err) {
         console.warn("⚠️ Failed to delete song from Cloudinary:", err.message);
      }

      // Remove from user.songs
      user.songs = user.songs.filter((s) => s.publicId !== publicId);
      await user.save();

      return res.json({ message: "Song deleted", songs: user.songs });
   } catch (err) {
      console.error("Delete song error:", err);
      return res.status(500).json({ error: "Failed to delete song" });
   }
});

export default router;
