
import express from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";

const router = express.Router();

// Setup Cloudinary storage
const storage = new CloudinaryStorage({
   cloudinary,
   params: {
      folder: "avatars",
      allowed_formats: ["jpg", "jpeg", "png", "gif"],
      transformation: [{ width: 200, height: 200, crop: "fill" }],
   },
});

const upload = multer({ storage });

// Upload endpoint
router.post("/", upload.single("avatar"), async (req, res) => {
   try {
      if (!req.file?.path) {
         return res.status(400).json({ error: "No file uploaded" });
      }


      const userId = req.body.userId;
      if (userId) {
         await User.findByIdAndUpdate(userId, { avatar: req.file.path });
      }

      return res.json({ url: req.file.path });
   } catch (err) {
      console.error("Avatar upload error:", err);
      return res.status(500).json({ error: "Upload failed" });
   }
});

export default router;

