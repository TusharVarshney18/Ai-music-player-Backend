import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import Song from "../models/Song.js";
import User from "../models/User.js";
import ListeningEvent from "../models/ListeningEvent.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// ─────────── MULTER CONFIG (memory upload, 20MB limit) ───────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isAudio = file.mimetype.startsWith("audio/");
    const isImage = file.mimetype.startsWith("image/");
    if (!isAudio && !isImage) {
      return cb(new Error("Only audio and image files are allowed"));
    }
    cb(null, true);
  },
});

/* ──────────────────────────────── UPLOAD SONG ──────────────────────────────── */
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
          return res.status(413).json({ error: "File too large. Max size is 20MB" });
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
      if (!songFile) return res.status(400).json({ error: "No song file uploaded" });

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      // ─────────── Upload song to Cloudinary (public) ───────────
      const songUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video",
            folder: "songs",
            type: "upload", // public file delivery
            access_mode: "public",
          },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(songFile.buffer);
      });

      // ─────────── Upload cover (optional) ───────────
      let coverUrl = "";
      if (coverFile) {
        const coverUpload = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: "image",
              folder: "covers",
              access_mode: "public",
            },
            (error, result) => (error ? reject(error) : resolve(result))
          );
          stream.end(coverFile.buffer);
        });
        coverUrl = coverUpload.secure_url;
      }

      // ─────────── Save in MongoDB ───────────
      const newSong = await Song.create({
        title: req.body.title || songFile.originalname,
        artist: req.body.artist || "Unknown Artist",
        album: req.body.album || "Singles",
        cover: coverUrl || "",
        url: songUpload.secure_url,
        publicId: songUpload.public_id,
        uploadedBy: user._id,
      });

      res.json({ message: "✅ Song uploaded successfully", song: newSong });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

/* ──────────────────────────────── FETCH SONGS ──────────────────────────────── */

// 🎧 All songs (optional ?genre= filter)
router.get("/", async (req, res) => {
  try {
    const { genre, limit = 100, sort } = req.query;
    const query = {};
    if (genre) query.genre = genre;

    let songsQuery = Song.find(query).populate("uploadedBy", "username displayName");
    if (sort === "popular") songsQuery = songsQuery.sort({ plays: -1, likesCount: -1 });
    else if (sort === "recent") songsQuery = songsQuery.sort({ createdAt: -1 });
    else songsQuery = songsQuery.sort({ createdAt: -1 });

    const songs = await songsQuery.limit(parseInt(limit, 10) || 100);
    res.json({ songs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch songs" });
  }
});

// 🏷️ All genres (distinct)
router.get("/genres", async (req, res) => {
  try {
    const genres = await Song.distinct("genre");
    res.json({ genres: genres.filter(Boolean).sort() });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch genres" });
  }
});

// 🔍 Search by title, artist, album
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q?.trim() || "";
    if (!q) return res.json({ songs: [] });

    const songs = await Song.find({
      $or: [{ title: { $regex: q, $options: "i" } }, { artist: { $regex: q, $options: "i" } }, { album: { $regex: q, $options: "i" } }],
    }).populate("uploadedBy", "username displayName");

    res.json({ songs });
  } catch {
    res.status(500).json({ error: "Failed to search songs" });
  }
});

// 💿 Album
router.get("/album/:albumName", async (req, res) => {
  try {
    const songs = await Song.find({ album: req.params.albumName }).populate("uploadedBy", "username displayName");

    if (!songs.length) return res.status(404).json({ error: "No songs found for this album" });
    res.json({ album: req.params.albumName, songs });
  } catch {
    res.status(500).json({ error: "Failed to fetch album songs" });
  }
});

// ▶️ Track a play (increments counter + records listening event)
router.post("/:id/play", authMiddleware, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) return res.status(404).json({ error: "Song not found" });

    const durationSec = Math.max(0, Math.min(parseFloat(req.body?.duration) || 0, song.duration || 0));

    song.plays += 1;
    await song.save();

    try {
      await ListeningEvent.create({ userId: req.user.id, songId: song._id, durationSec });
    } catch (err) {
      console.warn("ListeningEvent record failed:", err.message);
    }

    res.json({ plays: song.plays });
  } catch (err) {
    console.error("Play tracking error:", err);
    res.status(500).json({ error: "Failed to track play" });
  }
});

/* ──────────────────────────────── ADMIN ACTIONS ──────────────────────────────── */

// ❌ Delete
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) return res.status(404).json({ error: "Song not found" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
      return res.status(403).json({ error: "Not authorized" });
    }

    try {
      await cloudinary.uploader.destroy(song.publicId, { resource_type: "video" });
    } catch (err) {
      console.warn("Cloudinary delete failed:", err.message);
    }

    await song.deleteOne();
    res.json({ message: "Song deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete song" });
  }
});

// ✏️ Update metadata
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const update = { ...req.body };
    delete update.url;
    delete update.publicId;

    const song = await Song.findById(req.params.id);
    if (!song) return res.status(404).json({ error: "Song not found" });

    const user = await User.findById(req.user.id);
    if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
      return res.status(403).json({ error: "Not authorized" });
    }

    Object.assign(song, update);
    await song.save();
    res.json({ message: "Song updated successfully", song });
  } catch (err) {
    res.status(500).json({ error: "Failed to update song" });
  }
});

export default router;
