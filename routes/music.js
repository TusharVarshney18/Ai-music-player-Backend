import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import Song from "../models/Song.js";
import User from "../models/User.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// Multer config: allow only audio files, max 15 MB
const upload = multer({
   storage: multer.memoryStorage(),
   limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
   fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith("audio/")) {
         return cb(new Error("Only audio files are allowed"));
      }
      cb(null, true);
   },
});

/**
 * 🎵 Upload a song (requires login)
 */
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
                  resource_type: "video", // for audio files
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

         // ✅ Save to global Song collection
         const newSong = await Song.create({
            title: req.body.title || req.file.originalname,
            artist: req.body.artist || "Unknown Artist",
            url: result.secure_url,
            publicId: result.public_id,
            uploadedBy: user._id,
         });

         return res.json({
            message: "Song uploaded successfully",
            song: newSong,
         });
      } catch (err) {
         console.error("Song upload error:", err);
         return res.status(500).json({ error: err.message || "Upload failed" });
      }
   }
);

/**
 * 🎵 Get ALL songs (public, like Spotify)
 */
router.get("/", async (req, res) => {
   try {
      const songs = await Song.find().populate("uploadedBy", "username displayName");
      return res.json({ songs });
   } catch (err) {
      console.error("Fetch songs error:", err);
      return res.status(500).json({ error: "Failed to fetch songs" });
   }
});

/**
 * 🎵 Delete a song (only uploader or admin can delete)
 */
router.delete("/:id", authMiddleware, async (req, res) => {
   try {
      const song = await Song.findById(req.params.id);
      if (!song) return res.status(404).json({ error: "Song not found" });

      // check if current user is uploader or admin
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
         return res.status(403).json({ error: "Not authorized to delete this song" });
      }

      // delete from Cloudinary
      try {
         await cloudinary.uploader.destroy(song.publicId, { resource_type: "video" });
      } catch (err) {
         console.warn("⚠️ Failed to delete from Cloudinary:", err.message);
      }

      // remove from DB
      await song.deleteOne();

      return res.json({ message: "Song deleted successfully" });
   } catch (err) {
      console.error("Delete song error:", err);
      return res.status(500).json({ error: "Failed to delete song" });
   }
});

export default router;
