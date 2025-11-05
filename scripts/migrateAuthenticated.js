import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import Song from "../models/Song.js"; // ✅ correct relative path

dotenv.config();

// Cloudinary setup
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

try {
  // Connect to MongoDB
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB || "music_app",
  });
  console.log("✅ Connected to MongoDB");

  const songs = await Song.find();
  console.log(`🎵 Found ${songs.length} songs to process`);

  for (const song of songs) {
    try {
      // Skip if already migrated
      if (song.url.includes("/image/") || song.url.includes("/video/upload/")) {
        console.log(`⏭️ Skipping ${song.title} (already authenticated or private)`);
        continue;
      }

      // Backup original URL if not saved
      if (!song.backupUrl) {
        song.backupUrl = song.url;
        await song.save();
      }

      console.log(`⬇️ Downloading ${song.title}...`);
      const res = await fetch(song.url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);

      const buffer = Buffer.from(await res.arrayBuffer());
      const tempPath = path.resolve(`./temp-${song._id}.mp3`);
      fs.writeFileSync(tempPath, buffer);

      console.log(`⬆️ Reuploading ${song.title} as authenticated...`);
      const uploadRes = await cloudinary.uploader.upload(tempPath, {
        resource_type: "video",
        folder: "songs",
        type: "authenticated", // 🔒 make private
      });

      song.url = uploadRes.secure_url;
      song.publicId = uploadRes.public_id;
      await song.save();

      fs.unlinkSync(tempPath);
      console.log(`✅ Migrated: ${song.title}`);
    } catch (err) {
      console.error(`❌ Error migrating "${song.title}": ${err.message}`);
    }
  }

  console.log("🎉 Migration complete!");
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error("❌ Migration failed:", err);
  process.exit(1);
}
