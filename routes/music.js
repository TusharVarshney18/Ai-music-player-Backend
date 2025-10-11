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
   limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
   fileFilter: (req, file, cb) => {
      const isAudio = file.mimetype.startsWith("audio/");
      const isImage = file.mimetype.startsWith("image/");

      if (!isAudio && !isImage) {
         return cb(new Error("Only audio and image files are allowed"));
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
      // ✅ Handle both "song" and "cover" fields
      upload.fields([
         { name: "song", maxCount: 1 },
         { name: "cover", maxCount: 1 },
      ])(req, res, (err) => {
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
         const songFile = req.files?.song?.[0];
         const coverFile = req.files?.cover?.[0];

         if (!songFile) {
            return res.status(400).json({ error: "No song file uploaded" });
         }

         const user = await User.findById(req.user.id);
         if (!user) return res.status(404).json({ error: "User not found" });

         // ✅ Upload song to Cloudinary
         const songUpload = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
               {
                  resource_type: "video", // Needed for mp3/mp4 files
                  folder: "songs",
               },
               (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
               }
            );
            stream.end(songFile.buffer);
         });

         // ✅ Upload cover image (optional)
         let coverUrl = "";
         if (coverFile) {
            const coverUpload = await new Promise((resolve, reject) => {
               const stream = cloudinary.uploader.upload_stream(
                  {
                     resource_type: "image",
                     folder: "covers",
                  },
                  (error, result) => {
                     if (error) reject(error);
                     else resolve(result);
                  }
               );
               stream.end(coverFile.buffer);
            });
            coverUrl = coverUpload.secure_url;
         }

         // ✅ Save song entry in MongoDB
         const newSong = await Song.create({
            title: req.body.title || songFile.originalname,
            artist: req.body.artist || "Unknown Artist",
            album: req.body.album || "Singles",
            cover: coverUrl || req.body.cover || "",
            url: songUpload.secure_url,
            publicId: songUpload.public_id,
            uploadedBy: user._id,
         });

         return res.json({
            message: "✅ Song uploaded successfully",
            song: newSong,
         });
      } catch (err) {
         console.error("Song upload error:", err);
         return res.status(500).json({ error: err.message || "Upload failed" });
      }
   }
);


/**
 * 🎧 Get all songs (public, like Spotify)
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
 * 🔍 Search songs by title, artist, or album
 */
router.get("/search", async (req, res) => {
   try {
      const query = req.query.q?.trim() || "";
      if (!query) return res.json({ songs: [] });

      const songs = await Song.find({
         $or: [
            { title: { $regex: query, $options: "i" } },
            { artist: { $regex: query, $options: "i" } },
            { album: { $regex: query, $options: "i" } },
            { cover: { $regex: query, $options: "i" } }
         ],
      }).populate("uploadedBy", "username displayName");

      res.json({ songs });
   } catch (err) {
      console.error("Search error:", err);
      res.status(500).json({ error: "Failed to search songs" });
   }
});

/**
 * 💿 Get songs by album name
 */
router.get("/album/:albumName", async (req, res) => {
   try {
      const { albumName } = req.params;
      const songs = await Song.find({ album: albumName }).populate("uploadedBy", "username displayName");

      if (!songs.length) {
         return res.status(404).json({ error: "No songs found for this album" });
      }

      res.json({ album: albumName, songs });
   } catch (err) {
      console.error("Album fetch error:", err);
      res.status(500).json({ error: "Failed to fetch album songs" });
   }
});

/**
 * ❌ Delete a song (only uploader or admin)
 */
router.delete("/:id", authMiddleware, async (req, res) => {
   try {
      const song = await Song.findById(req.params.id);
      if (!song) return res.status(404).json({ error: "Song not found" });

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
         return res.status(403).json({ error: "Not authorized to delete this song" });
      }

      try {
         await cloudinary.uploader.destroy(song.publicId, { resource_type: "video" });
      } catch (err) {
         console.warn("⚠️ Cloudinary delete failed:", err.message);
      }

      await song.deleteOne();
      res.json({ message: "Song deleted successfully" });
   } catch (err) {
      console.error("Delete song error:", err);
      res.status(500).json({ error: "Failed to delete song" });
   }
});


/**
 * ✏️ Update song details (only uploader or admin)
 */
router.patch("/:id", authMiddleware, async (req, res) => {
   try {
      const { id } = req.params;
      const updateData = req.body; // e.g. { album: "New Album", title: "New Title" }

      const song = await Song.findById(id);
      if (!song) {
         return res.status(404).json({ error: "Song not found" });
      }

      const user = await User.findById(req.user.id);
      if (!user) {
         return res.status(404).json({ error: "User not found" });
      }

      // ✅ Allow only uploader or admin
      if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
         return res.status(403).json({ error: "Not authorized to update this song" });
      }

      // ✅ Apply updates
      Object.assign(song, updateData);
      await song.save();

      res.json({ message: "Song updated successfully", song });
   } catch (err) {
      console.error("Update song error:", err);
      res.status(500).json({ error: "Failed to update song" });
   }
});


//Cover 

/**
 * 🖼️ GET /api/music/:id/cover
 * Returns the cover image URL for a song
 */
router.get("/:id/cover", async (req, res) => {
   try {
      const song = await Song.findById(req.params.id);
      if (!song) return res.status(404).json({ error: "Song not found" });

      if (!song.cover) {
         return res.status(404).json({ error: "This song has no cover image" });
      }

      res.json({
         songId: song._id,
         title: song.title,
         cover: song.cover,
      });
   } catch (err) {
      console.error("Get cover error:", err);
      res.status(500).json({ error: "Failed to fetch cover image" });
   }
});


router.put("/:id/cover", authMiddleware, upload.single("cover"), async (req, res) => {
   try {
      const song = await Song.findById(req.params.id);
      if (!song) return res.status(404).json({ error: "Song not found" });

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      // ✅ Permission check (uploader or admin)
      if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
         return res.status(403).json({ error: "Not authorized to update this cover" });
      }

      // ✅ Handle no file
      if (!req.file) return res.status(400).json({ error: "No cover image provided" });

      // ✅ Delete old cover from Cloudinary if exists
      if (song.cover && song.cover.includes("cloudinary.com")) {
         try {
            const oldPublicId = song.cover.split("/").pop().split(".")[0];
            await cloudinary.uploader.destroy(`covers/${oldPublicId}`, { resource_type: "image" });
         } catch (err) {
            console.warn("⚠️ Failed to delete old cover:", err.message);
         }
      }

      // ✅ Upload new cover
      const uploadResult = await new Promise((resolve, reject) => {
         const stream = cloudinary.uploader.upload_stream(
            {
               resource_type: "image",
               folder: "covers",
            },
            (error, result) => {
               if (error) reject(error);
               else resolve(result);
            }
         );
         stream.end(req.file.buffer);
      });

      // ✅ Save in DB
      song.cover = uploadResult.secure_url;
      await song.save();

      res.json({
         message: "✅ Cover updated successfully",
         cover: uploadResult.secure_url,
      });
   } catch (err) {
      console.error("Cover upload error:", err);
      res.status(500).json({ error: "Failed to upload cover" });
   }
});


//cover delete 
router.delete("/:id/cover", authMiddleware, async (req, res) => {
   try {
      const song = await Song.findById(req.params.id);
      if (!song) return res.status(404).json({ error: "Song not found" });

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
         return res.status(403).json({ error: "Not authorized to delete this cover" });
      }

      // ✅ Delete from Cloudinary
      if (song.cover && song.cover.includes("cloudinary.com")) {
         try {
            const publicId = song.cover.split("/").pop().split(".")[0];
            await cloudinary.uploader.destroy(`covers/${publicId}`, { resource_type: "image" });
         } catch (err) {
            console.warn("⚠️ Failed to delete Cloudinary cover:", err.message);
         }
      }

      song.cover = "";
      await song.save();

      res.json({ message: "✅ Cover deleted successfully" });
   } catch (err) {
      console.error("Cover delete error:", err);
      res.status(500).json({ error: "Failed to delete cover" });
   }
});

export default router;
