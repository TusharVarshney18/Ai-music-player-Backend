import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import helmet from "helmet";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import csrf from "csurf";

import avatarRoutes from "./routes/avatar.js";
import authRoutes from "./routes/auth.js";

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

// ---------- Middlewares ----------
app.disable("x-powered-by");
app.use(helmet());
app.use(hpp());

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());


const allowedOrigins = ["http://localhost:3000", "https://your-frontend.vercel.app", "https://www.postman.com"];
app.use(cors({ origin: (origin, callback) => { if (!origin || allowedOrigins.includes(origin)) { callback(null, true); } else { callback(new Error("Not allowed by CORS")); } }, credentials: true, methods: ["GET", "POST", "PUT", "DELETE"], allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"], }));



// ---------- CSRF Protection ----------
const csrfProtection = csrf({
   cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
   },
});

// Route to fetch CSRF token
app.get("/api/csrf-token", csrfProtection, (req, res) => {
   res.json({ csrfToken: req.csrfToken() });
});

// Apply CSRF to all requests except login/register
app.use((req, res, next) => {
   const skipPaths = ["/api/auth/login", "/api/auth/register", "/api/csrf-token"];
   if (skipPaths.includes(req.path)) {
      return next();
   }

   if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
      return csrfProtection(req, res, next);
   }

   next();
});

// ---------- Routes ----------
app.use("/api/auth", authRoutes);
app.use("/api/avatar", avatarRoutes);

// Debug route (check cookies + headers)
app.get("/api/debug-cookies", (req, res) => {
   res.json({
      cookies: req.cookies,
      headers: req.headers,
   });
});

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
