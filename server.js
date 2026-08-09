import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import helmet from "helmet";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import musicRoutes from "./routes/music.js";
import avatarRoutes from "./routes/avatar.js";
import authRoutes from "./routes/auth.js";
import chatRouter from "./routes/chat.js";
import uploadRoutes from "./routes/upload.js";
import playlistRoutes from "./routes/playlists.js";
import likesRoutes from "./routes/likes.js";
import statsRoutes from "./routes/stats.js";
import adminRoutes from "./routes/admin.js";

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN, // frontend (set in .env / Vercel)
  "http://localhost:3000",
  "https://ai-music-player-frontend.vercel.app", // frontend (Vercel)
  "https://ai-music-player-backend.vercel.app", // backend (Vercel)
  "http://localhost:5000",
  "https://www.postman.com",
].filter(Boolean);

// ✅ Trust proxy headers (needed for Vercel, Render, etc.)
app.set("trust proxy", 1);

// ---------- Middlewares ----------
app.disable("x-powered-by");
app.use(helmet());
app.use(hpp());

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("❌ CORS blocked:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ FIX for Vercel: use regex instead of '*' for preflight
app.options(/.*/, (req, res) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.status(204).end();
});

// ---------- Routes ----------
app.use("/api/auth", authRoutes);
app.use("/api/avatar", avatarRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/chat", chatRouter);
app.use("/api/upload", uploadRoutes);
app.use("/api/playlist", playlistRoutes);
app.use("/api/likes", likesRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/admin", adminRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({ ok: true, message: "🎵 AI Music Player backend is running" });
});

// ---------- DB & Server ----------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI, { dbName: process.env.MONGO_DB || "music_app" })
  .then(() => {
    app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}\n✅ Connected to MongoDB`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });
