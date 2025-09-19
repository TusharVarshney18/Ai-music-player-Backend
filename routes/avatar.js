import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";

const router = express.Router();

// Use memory storage (file kept in memory, not disk)
const upload = multer({ storage: multer.memoryStorage() });

// Upload endpoint
router.post("/", upload.single("avatar"), async (req, res) => {
   try {
      if (!req.file) {
         return res.status(400).json({ error: "No file uploaded" });
      }

      // Upload buffer to Cloudinary
      const result = await new Promise((resolve, reject) => {
         const stream = cloudinary.uploader.upload_stream(
            {
               folder: "avatars",
               transformation: [{ width: 200, height: 200, crop: "fill" }],
            },
            (error, result) => {
               if (error) reject(error);
               else resolve(result);
            }
         );
         stream.end(req.file.buffer);
      });

      // Save avatar URL to user (if userId provided)
      const userId = req.body.userId;
      if (userId) {
         await User.findByIdAndUpdate(userId, { avatar: result.secure_url });
      }

      return res.json({ url: result.secure_url });
   } catch (err) {
      console.error("Avatar upload error:", err);
      return res.status(500).json({ error: "Upload failed" });
   }
});

export default router;
