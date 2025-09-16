import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import helmet from "helmet";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import csrf from "csurf";

import authRoutes from "./routes/auth.js";

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

// ---------- Middlewares ----------
app.disable("x-powered-by");
app.use(helmet());
app.use(hpp());

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// Setup CORS BEFORE CSRF
app.use(
   cors({
      origin: FRONTEND_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
   })
);

// ---------- CSRF Protection ----------
const csrfProtection = csrf({
   cookie: {
      key: "_csrf",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
   },
});

// Route to fetch CSRF token and set it as a cookie
app.get("/api/csrf-token", csrfProtection, (req, res) => {
   res.cookie("_csrf", req.csrfToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
   });
   res.json({ csrfToken: req.csrfToken() });
});

// Apply CSRF protection to mutating requests (POST, PUT, DELETE)
app.use((req, res, next) => {
   if (["POST", "PUT", "DELETE"].includes(req.method)) {
      return csrfProtection(req, res, next);
   }
   next();
});

// ---------- Routes ----------
app.use("/api/auth", authRoutes);

// Test route
app.get("/", (req, res) => {
   res.json({ message: "AI Music Player Backend is running 🚀" });
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
