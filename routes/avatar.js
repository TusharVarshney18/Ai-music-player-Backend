import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";

const router = express.Router();

// Multer config: memory storage, 2MB limit, image-only filter
const upload = multer({
   storage: multer.memoryStorage(),
   limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
   fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith("image/")) {
         return cb(new Error("Only image uploads are allowed"));
      }
      cb(null, true);
   },
});

// Avatar upload route
router.post(
   "/",
   (req, res, next) => {
      upload.single("avatar")(req, res, (err) => {
         if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
               return res.status(413).json({ error: "File too large. Max size is 2MB" });
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

         // ✅ Verify user from access token
         const token = req.cookies.access_token;
         if (!token) return res.status(401).json({ error: "Unauthorized" });

         let payload;
         try {
            payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
         } catch (err) {
            return res.status(401).json({ error: "Invalid or expired token" });
         }

         // ✅ Find user
         const user = await User.findById(payload.sub);
         if (!user) return res.status(404).json({ error: "User not found" });

         // ✅ Delete old avatar if exists
         if (user.avatarPublicId) {
            try {
               await cloudinary.uploader.destroy(user.avatarPublicId);
            } catch (err) {
               console.warn("⚠️ Failed to delete old avatar:", err.message);
            }
         }

         // ✅ Upload new avatar to Cloudinary
         const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
               {
                  folder: "avatars",
                  transformation: [{ width: 200, height: 200, crop: "fill" }],
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

         // ✅ Save avatar URL + public_id to user
         user.avatarUrl = result.secure_url;
         user.avatarPublicId = result.public_id;
         await user.save();

         return res.json({
            message: "Avatar uploaded successfully",
            avatarUrl: result.secure_url,
            user: {
               _id: user._id,
               username: user.username,
               displayName: user.displayName,
               avatarUrl: user.avatarUrl,
               roles: user.roles,
            },
         });
      } catch (err) {
         console.error("Avatar upload error:", err);
         return res.status(500).json({ error: err.message || "Upload failed" });
      }
   }
);

export default router;
