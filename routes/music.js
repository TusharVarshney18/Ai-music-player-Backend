import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import Song from "../models/Song.js";
import User from "../models/User.js";
import authMiddleware from "../middleware/auth.js";
import fetch from "node-fetch";

const router = express.Router();

// Multer config: allow only audio files, max 20 MB
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

      // Upload song to Cloudinary
      const songUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video",
            folder: "songs",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(songFile.buffer);
      });

      // Upload cover image (optional)
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

      // Save song entry in MongoDB
      const newSong = await Song.create({
        title: req.body.title || songFile.originalname,
        artist: req.body.artist || "Unknown Artist",
        album: req.body.album || "Singles",
        cover: coverUrl || req.body.cover || "",
        url: songUpload.secure_url, // ✅ Store in DB, but DON'T expose
        publicId: songUpload.public_id, // ✅ Store in DB, but DON'T expose
        uploadedBy: user._id,
      });

      // ✅ Return song WITHOUT url and publicId
      const songResponse = newSong.toObject();
      delete songResponse.url;
      delete songResponse.publicId;

      return res.json({
        message: "✅ Song uploaded successfully",
        song: songResponse,
      });
    } catch (err) {
      console.error("Song upload error:", err);
      return res.status(500).json({ error: err.message || "Upload failed" });
    }
  }
);

/**
 * 🎧 Get all songs (public, like Spotify)
 * ✅ NEVER expose url and publicId
 */
router.get("/", async (req, res) => {
  try {
    const songs = await Song.find().populate("uploadedBy", "username displayName").select("-url -publicId"); // ❌ EXCLUDE these fields

    return res.json({ songs });
  } catch (err) {
    console.error("Fetch songs error:", err);
    return res.status(500).json({ error: "Failed to fetch songs" });
  }
});

/**
 * 🔒 Securely stream a song (Spotify style)
 * ✅ Only serves to authenticated users
 * ✅ Backend proxies Cloudinary URL (frontend never sees it)
 */
router.get("/stream/:id", authMiddleware, async (req, res) => {
  try {
    // ✅ Need to include url field for this query only
    const song = await Song.findById(req.params.id).select("+url");

    if (!song || !song.url) {
      return res.status(404).json({ error: "Song not found" });
    }

    // ✅ Log stream access for analytics
    console.log(`🎵 Stream accessed - User: ${req.user.id}, Song: ${req.params.id}`);

    // ✅ Fetch audio from Cloudinary on the backend
    const fileRes = await fetch(song.url, { method: "GET" });

    if (!fileRes.ok) {
      return res.status(500).json({ error: "Failed to fetch audio stream" });
    }

    // ✅ Set proper headers and stream to client
    res.setHeader("Content-Type", fileRes.headers.get("Content-Type") || "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(fileRes.status);

    fileRes.body.pipe(res);
  } catch (err) {
    console.error("Stream route error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * 🔍 Search songs by title, artist, or album
 * ✅ NEVER expose url and publicId
 */
router.get("/search", async (req, res) => {
  try {
    const query = req.query.q?.trim() || "";
    if (!query) return res.json({ songs: [] });

    const songs = await Song.find({
      $or: [{ title: { $regex: query, $options: "i" } }, { artist: { $regex: query, $options: "i" } }, { album: { $regex: query, $options: "i" } }],
    })
      .populate("uploadedBy", "username displayName")
      .select("-url -publicId"); // ❌ EXCLUDE these fields

    res.json({ songs });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Failed to search songs" });
  }
});

/**
 * 💿 Get songs by album name
 * ✅ NEVER expose url and publicId
 */
router.get("/album/:albumName", async (req, res) => {
  try {
    const { albumName } = req.params;
    const songs = await Song.find({ album: albumName }).populate("uploadedBy", "username displayName").select("-url -publicId"); // ❌ EXCLUDE these fields

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
    const song = await Song.findById(req.params.id).select("+publicId");
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
 * ✅ Don't expose url and publicId
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // ✅ Prevent users from updating these fields
    delete updateData.url;
    delete updateData.publicId;

    const song = await Song.findById(id);
    if (!song) {
      return res.status(404).json({ error: "Song not found" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
      return res.status(403).json({ error: "Not authorized to update this song" });
    }

    Object.assign(song, updateData);
    await song.save();

    // ✅ Return song WITHOUT url and publicId
    const songResponse = song.toObject();
    delete songResponse.url;
    delete songResponse.publicId;

    res.json({ message: "Song updated successfully", song: songResponse });
  } catch (err) {
    console.error("Update song error:", err);
    res.status(500).json({ error: "Failed to update song" });
  }
});

export default router;
