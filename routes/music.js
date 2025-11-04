import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import Song from "../models/Song.js";
import User from "../models/User.js";
import authMiddleware from "../middleware/auth.js";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";

const router = express.Router();
const { STREAM_SECRET = "super_secret_stream_key" } = process.env;

// Multer config: allow only audio/image files
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

// Utility: Sign & verify short-lived stream tokens
function signStreamToken(userId, songId, ttlSeconds = 60) {
  return jwt.sign({ sub: userId, sid: songId }, STREAM_SECRET, {
    expiresIn: ttlSeconds,
  });
}
function verifyStreamToken(token) {
  return jwt.verify(token, STREAM_SECRET);
}

/* ──────────────────────────────── UPLOAD ──────────────────────────────── */
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

      // Upload song (authenticated on Cloudinary)
      const songUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video",
            folder: "songs",
            type: "authenticated", // 🔒 not publicly accessible
          },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(songFile.buffer);
      });

      // Upload cover (optional)
      let coverUrl = "";
      if (coverFile) {
        const coverUpload = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: "image",
              folder: "covers",
            },
            (error, result) => (error ? reject(error) : resolve(result))
          );
          stream.end(coverFile.buffer);
        });
        coverUrl = coverUpload.secure_url;
      }

      // Save to DB
      const newSong = await Song.create({
        title: req.body.title || songFile.originalname,
        artist: req.body.artist || "Unknown Artist",
        album: req.body.album || "Singles",
        cover: coverUrl || "",
        url: songUpload.secure_url,
        publicId: songUpload.public_id,
        uploadedBy: user._id,
      });

      const songResponse = newSong.toObject();
      delete songResponse.url;
      delete songResponse.publicId;

      res.json({ message: "✅ Song uploaded", song: songResponse });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

/* ──────────────────────────────── PUBLIC ROUTES ──────────────────────────────── */

// 🎧 Fetch all songs (hide URL)
router.get("/", async (req, res) => {
  try {
    const songs = await Song.find().populate("uploadedBy", "username displayName").select("-url -publicId");
    res.json({ songs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch songs" });
  }
});

// 🔍 Search songs
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q?.trim() || "";
    if (!q) return res.json({ songs: [] });
    const songs = await Song.find({
      $or: [{ title: { $regex: q, $options: "i" } }, { artist: { $regex: q, $options: "i" } }, { album: { $regex: q, $options: "i" } }],
    })
      .populate("uploadedBy", "username displayName")
      .select("-url -publicId");
    res.json({ songs });
  } catch {
    res.status(500).json({ error: "Failed to search songs" });
  }
});

// 💿 Album view
router.get("/album/:albumName", async (req, res) => {
  try {
    const songs = await Song.find({ album: req.params.albumName }).populate("uploadedBy", "username displayName").select("-url -publicId");
    if (!songs.length) return res.status(404).json({ error: "No songs found for this album" });
    res.json({ album: req.params.albumName, songs });
  } catch {
    res.status(500).json({ error: "Failed to fetch album songs" });
  }
});

/* ──────────────────────────────── SECURE STREAMING ──────────────────────────────── */

// 🎟️ Generate short-lived token
router.get("/stream-token/:id", authMiddleware, async (req, res) => {
  try {
    const exists = await Song.exists({ _id: req.params.id });
    if (!exists) return res.status(404).json({ error: "Song not found" });

    const token = signStreamToken(req.user.id, req.params.id, 60); // 1 min
    res.json({ token, expiresIn: 60 });
  } catch (err) {
    console.error("Token error:", err);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// 🎵 Secure streaming route
// 🎵 Secure streaming route (dual-auth: stream token OR user session)
router.get("/stream/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.query.t || req.query.token;

    let userId = null;

    // ✅ 1. Try stream token first
    if (token) {
      try {
        const payload = verifyStreamToken(token);
        if (payload.sid !== id) {
          return res.status(403).json({ error: "Invalid stream token" });
        }
        userId = payload.sub;
      } catch (err) {
        console.warn("❌ Invalid stream token:", err.message);
        return res.status(401).json({ error: "Invalid or expired stream token" });
      }
    } else {
      // ✅ 2. Fall back to normal auth middleware
      await new Promise((resolve, reject) => {
        authMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
      });
      userId = req.user?.id;
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized - no valid token" });
    }

    // ✅ Fetch song
    const song = await Song.findById(id).select("+url");
    if (!song || !song.url) {
      return res.status(404).json({ error: "Song not found" });
    }

    // ✅ Request file from Cloudinary
    const clientRange = req.headers.range;
    const headers = clientRange ? { Range: clientRange } : {};
    const upstream = await fetch(song.url, { headers });

    if (!upstream.ok && upstream.status !== 206) {
      console.error("❌ Cloudinary fetch failed:", upstream.status, upstream.statusText);
      return res.status(502).json({ error: "Failed to fetch audio" });
    }

    // ✅ Set proper streaming headers
    const contentType = upstream.headers.get("content-type") || "audio/mpeg";
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const status = clientRange && contentRange ? 206 : 200;

    res.status(status);
    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    res.setHeader("Accept-Ranges", "bytes");

    // 🚫 No caching / saving
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");

    // ✅ Pipe Cloudinary stream
    upstream.body.pipe(res);
  } catch (err) {
    console.error("Stream error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ──────────────────────────────── ADMIN ROUTES ──────────────────────────────── */

// ❌ Delete
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id).select("+publicId");
    if (!song) return res.status(404).json({ error: "Song not found" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
      return res.status(403).json({ error: "Not authorized" });
    }

    try {
      await cloudinary.uploader.destroy(song.publicId, {
        resource_type: "video",
      });
    } catch (err) {
      console.warn("Cloudinary delete failed:", err.message);
    }

    await song.deleteOne();
    res.json({ message: "Song deleted" });
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

    const out = song.toObject();
    delete out.url;
    delete out.publicId;
    res.json({ message: "Song updated", song: out });
  } catch (err) {
    res.status(500).json({ error: "Failed to update song" });
  }
});

export default router;
