import express from "express";
import dotenv from "dotenv";
dotenv.config();
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { body, validationResult } from "express-validator";
import rateLimit from "express-rate-limit";
import User from "../models/User.js";

const router = express.Router();
const {
   JWT_ACCESS_SECRET,
   JWT_REFRESH_SECRET,
   NODE_ENV,
} = process.env;

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
   console.error("Missing JWT secrets in .env (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET)");
   process.exit(1);
}

// --- Config ---
const ACCESS_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const baseCookie = {
   httpOnly: true,
   secure: NODE_ENV === "production",
   sameSite: "strict",
   path: "/",
};

// Argon2 options (adjust for your environment)
const ARGON_OPTS = {
   type: argon2.argon2id,
   memoryCost: 2 ** 16, // 64MB
   timeCost: 3,
   parallelism: 1,
};

// -- Rate limiters --
const ipLimiter = rateLimit({
   windowMs: 10 * 60 * 1000,
   max: 100,
   standardHeaders: true,
   legacyHeaders: false,
});

const authLimiter = rateLimit({
   windowMs: 10 * 60 * 1000,
   max: 20,
   standardHeaders: true,
   legacyHeaders: false,
   message: { error: "Too many attempts. Please try again later." },
});

router.use(ipLimiter);

// --- Helpers ---
function signAccessToken(user) {
   return jwt.sign({ sub: user._id.toString(), username: user.username, roles: user.roles }, JWT_ACCESS_SECRET, {
      expiresIn: ACCESS_TTL_SECONDS,
   });
}

function signRefreshToken(user, jti) {
   return jwt.sign({ sub: user._id.toString(), jti }, JWT_REFRESH_SECRET, {
      expiresIn: Math.floor(REFRESH_TTL_MS / 1000),
   });
}

function setAuthCookies(res, accessToken, refreshToken) {
   res.cookie("access_token", accessToken, { ...baseCookie, maxAge: ACCESS_TTL_SECONDS * 1000 });
   res.cookie("refresh_token", refreshToken, { ...baseCookie, maxAge: REFRESH_TTL_MS });
}

// Validate input
const registerValidator = [
   body("username")
      .isString()
      .isLength({ min: 3, max: 48 })
      .trim()
      .toLowerCase(),

   // simpler password rule → only min length
   body("password")
      .isString()
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
];


const loginValidator = [
   body("username").isString().trim().toLowerCase(),
   body("password").isString(),
];

const isLocked = (user) => user.lockUntil && user.lockUntil > new Date();

// ------- REGISTER -------
router.post("/register", authLimiter, registerValidator, async (req, res) => {
   try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Invalid input" });

      const { username, password } = req.body;

      const existing = await User.findOne({ username }).lean();
      if (existing) return res.status(400).json({ error: "Invalid input" }); // generic message

      const passwordHash = await argon2.hash(password, ARGON_OPTS);
      const user = await User.create({ username, passwordHash });

      // Issue tokens on registration (optional)
      const jti = crypto.randomUUID();
      const refreshToken = signRefreshToken(user, jti);
      const accessToken = signAccessToken(user);
      const rtHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

      await User.updateOne({ _id: user._id }, { $push: { refreshTokens: { tokenHash: rtHash, expiresAt } } });

      setAuthCookies(res, accessToken, refreshToken);
      return res.status(201).json({ message: "Registered", user: { id: user._id, username: user.username } });
   } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ error: "Server error" });
   }
});

// ------- LOGIN -------
router.post("/login", authLimiter, loginValidator, async (req, res) => {
   try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Invalid credentials" });

      const { username, password } = req.body;
      const user = await User.findOne({ username });

      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      if (isLocked(user)) {
         return res.status(403).json({ error: "Account temporarily locked. Try later." });
      }

      const ok = await argon2.verify(user.passwordHash, password);
      if (!ok) {
         user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
         if (user.failedLoginAttempts >= 5) {
            user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // lock 15 minutes
            user.failedLoginAttempts = 0;
         }
         await user.save();
         return res.status(401).json({ error: "Invalid credentials" });
      }

      // success
      user.failedLoginAttempts = 0;
      user.lockUntil = null;

      const jti = crypto.randomUUID();
      const refreshToken = signRefreshToken(user, jti);
      const accessToken = signAccessToken(user);

      const rtHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
      user.refreshTokens.push({ tokenHash: rtHash, expiresAt, ip: req.ip, userAgent: req.get("user-agent") });

      await user.save();

      setAuthCookies(res, accessToken, refreshToken);
      return res.json({ message: "Login successful", user: { id: user._id, username: user.username } });
   } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Server error" });
   }
});

// ------- REFRESH -------
router.post("/refresh", async (req, res) => {
   try {
      const rt = req.cookies.refresh_token;
      if (!rt) return res.status(401).json({ error: "Unauthorized" });

      let payload;
      try {
         payload = jwt.verify(rt, JWT_REFRESH_SECRET);
      } catch {
         return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await User.findById(payload.sub);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const presentedHash = crypto.createHash("sha256").update(rt).digest("hex");
      const record = user.refreshTokens.find((t) => t.tokenHash === presentedHash && t.expiresAt > new Date());

      // reuse detection
      if (!record) {
         user.refreshTokens = [];
         await user.save();
         res.clearCookie("access_token");
         res.clearCookie("refresh_token");
         return res.status(401).json({ error: "Session invalidated" });
      }

      // rotation: remove old, add new
      user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== presentedHash);

      const newJti = crypto.randomUUID();
      const newRefreshToken = signRefreshToken(user, newJti);
      const newAccessToken = signAccessToken(user);
      const newHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");
      const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
      user.refreshTokens.push({ tokenHash: newHash, expiresAt, ip: req.ip, userAgent: req.get("user-agent") });

      await user.save();
      setAuthCookies(res, newAccessToken, newRefreshToken);
      return res.json({ ok: true });
   } catch (err) {
      console.error("Refresh error:", err);
      return res.status(500).json({ error: "Server error" });
   }
});

// ------- LOGOUT -------
router.post("/logout", async (req, res) => {
   const rt = req.cookies.refresh_token;
   try {
      if (rt) {
         const payload = jwt.verify(rt, JWT_REFRESH_SECRET);
         const user = await User.findById(payload.sub);
         if (user) {
            const presentedHash = crypto.createHash("sha256").update(rt).digest("hex");
            user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== presentedHash);
            await user.save();
         }
      }
   } catch (err) {
      // ignore parse errors
   } finally {
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      return res.json({ message: "Logged out" });
   }
});

// ------- ME -------
router.get("/me", async (req, res) => {
   const at = req.cookies.access_token;
   if (!at) return res.status(401).json({ error: "Unauthorized" });
   try {
      const payload = jwt.verify(at, JWT_ACCESS_SECRET);
      const user = await User.findById(payload.sub).lean();
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      return res.json({ user: { id: user._id, username: user.username, roles: user.roles } });
   } catch (err) {
      return res.status(401).json({ error: "Unauthorized" });
   }
});

export default router;
