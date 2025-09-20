import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";

const router = express.Router();

// Multer with memory storage + size limit (2MB)
const upload = multer({
   storage: multer.memoryStorage(),
   limits: { fileSize: 2 * 1024 * 1024 },
});

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

      // Save avatar URL to user (better: take userId from auth middleware)
      const userId = req.body.userId;
      let updatedUser = null;

      if (userId) {
         updatedUser = await User.findByIdAndUpdate(
            userId,
            { avatar: result.secure_url },
            { new: true }
         ).select("-password");
      }

      return res.json({
         success: true,
         url: result.secure_url,
         user: updatedUser,
      });
   } catch (err) {
      console.error("Avatar upload error:", err);
      return res.status(500).json({ error: err.message || "Upload failed" });
   }
});

export default router;
