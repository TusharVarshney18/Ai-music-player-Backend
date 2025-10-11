import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

// ✅ Configure Multer (for image uploads)
const upload = multer({
   storage: multer.memoryStorage(),
   limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
   fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith("image/")) {
         return cb(new Error("Only image files are allowed"));
      }
      cb(null, true);
   },
});

// ✅ Cloudinary config
cloudinary.config({
   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
   api_key: process.env.CLOUDINARY_API_KEY,
   api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ POST /api/upload/image
router.post("/image", upload.single("file"), async (req, res) => {
   try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const result = await new Promise((resolve, reject) => {
         const stream = cloudinary.uploader.upload_stream(
            { folder: "covers", resource_type: "image" },
            (error, result) => (error ? reject(error) : resolve(result))
         );
         stream.end(req.file.buffer);
      });

      res.json({ url: result.secure_url, publicId: result.public_id });
   } catch (error) {
      console.error("Image upload error:", error);
      res.status(500).json({ error: error.message || "Image upload failed" });
   }
});

router.get("/:id/cover", async (req, res) => {
   try {
      const song = await Song.findById(req.params.id);
      if (!song) return res.status(404).json({ error: "Song not found" });

      if (!song.cover) {
         return res.status(404).json({ error: "This song has no cover image" });
      }

      res.json({
         songId: song._id,
         title: song.title,
         cover: song.cover,
      });
   } catch (err) {
      console.error("Get cover error:", err);
      res.status(500).json({ error: "Failed to fetch cover image" });
   }
});


router.put("/:id/cover", authMiddleware, upload.single("cover"), async (req, res) => {
   try {
      const song = await Song.findById(req.params.id);
      if (!song) return res.status(404).json({ error: "Song not found" });

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      // ✅ Permission check (uploader or admin)
      if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
         return res.status(403).json({ error: "Not authorized to update this cover" });
      }

      // ✅ Handle no file
      if (!req.file) return res.status(400).json({ error: "No cover image provided" });

      // ✅ Delete old cover from Cloudinary if exists
      if (song.cover && song.cover.includes("cloudinary.com")) {
         try {
            const oldPublicId = song.cover.split("/").pop().split(".")[0];
            await cloudinary.uploader.destroy(`covers/${oldPublicId}`, { resource_type: "image" });
         } catch (err) {
            console.warn("⚠️ Failed to delete old cover:", err.message);
         }
      }

      // ✅ Upload new cover
      const uploadResult = await new Promise((resolve, reject) => {
         const stream = cloudinary.uploader.upload_stream(
            {
               resource_type: "image",
               folder: "covers",
            },
            (error, result) => {
               if (error) reject(error);
               else resolve(result);
            }
         );
         stream.end(req.file.buffer);
      });

      // ✅ Save in DB
      song.cover = uploadResult.secure_url;
      await song.save();

      res.json({
         message: "✅ Cover updated successfully",
         cover: uploadResult.secure_url,
      });
   } catch (err) {
      console.error("Cover upload error:", err);
      res.status(500).json({ error: "Failed to upload cover" });
   }
});


//cover delete 
router.delete("/:id/cover", authMiddleware, async (req, res) => {
   try {
      const song = await Song.findById(req.params.id);
      if (!song) return res.status(404).json({ error: "Song not found" });

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (song.uploadedBy.toString() !== user._id.toString() && !user.roles.includes("admin")) {
         return res.status(403).json({ error: "Not authorized to delete this cover" });
      }

      // ✅ Delete from Cloudinary
      if (song.cover && song.cover.includes("cloudinary.com")) {
         try {
            const publicId = song.cover.split("/").pop().split(".")[0];
            await cloudinary.uploader.destroy(`covers/${publicId}`, { resource_type: "image" });
         } catch (err) {
            console.warn("⚠️ Failed to delete Cloudinary cover:", err.message);
         }
      }

      song.cover = "";
      await song.save();

      res.json({ message: "✅ Cover deleted successfully" });
   } catch (err) {
      console.error("Cover delete error:", err);
      res.status(500).json({ error: "Failed to delete cover" });
   }
});


export default router;
