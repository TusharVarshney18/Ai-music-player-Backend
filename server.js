import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import helmet from "helmet";
import hpp from "hpp";
import cookieParser from "cookie-parser";

import avatarRoutes from "./routes/avatar.js";
import authRoutes from "./routes/auth.js";

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

const allowedOrigins = [
   "http://localhost:3000",
   "https://ai-music-player-frontend.vercel.app", // frontend
   "https://ai-music-player-backend.vercel.app", // backend (vercel)
   "http://localhost:5000",
   "https://www.postman.com",
];

// Trust proxy headers (needed for Vercel, Render, Nginx, etc.)
app.set("trust proxy", 1);


// ---------- Middlewares ----------
app.disable("x-powered-by");
app.use(helmet());
app.use(hpp());

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use(
   cors({
      origin: (origin, callback) => {
         if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
         } else {
            console.log("❌ CORS blocked:", origin);
            callback(new Error("Not allowed by CORS"));
         }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
   })
);

// ---------- Routes ----------
app.use("/api/auth", authRoutes);
app.use("/api/avatar", avatarRoutes);

// Test route
app.get("/", (req, res) => {
   res.json({ ok: true });
});

// ---------- DB & Server ----------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
   .connect(MONGO_URI, { dbName: process.env.MONGO_DB || "music_app" })
   .then(() => {
      app.listen(PORT, () =>
         console.log(
            `✅ Server running on http://localhost:${PORT}`,
            `\n✅ Connected to MongoDB`
         )
      );
   })
   .catch((err) => {
      console.error("MongoDB connection error:", err);
      process.exit(1);
   });
