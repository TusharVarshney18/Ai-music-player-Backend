import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Song from "../models/Song.js";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function convertToAuthenticated() {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB || "music_app",
  });

  console.log("✅ Connected to MongoDB");

  const songs = await Song.find();
  console.log(`🎵 Found ${songs.length} songs`);

  for (const song of songs) {
    try {
      if (!song.publicId) {
        console.warn(`⚠️ Skipping ${song.title} (no publicId)`);
        continue;
      }

      console.log(`🔄 Converting ${song.title} → authenticated...`);

      // Use explicit to modify access control
      const result = await cloudinary.uploader.explicit(song.publicId, {
        resource_type: "video",
        type: "upload",
        access_mode: "authenticated", // ✅ change visibility
      });

      if (!result || !result.secure_url) {
        throw new Error("Cloudinary explicit update failed");
      }

      song.url = result.secure_url;
      await song.save();

      console.log(`✅ Updated ${song.title}`);
    } catch (err) {
      console.error(`❌ Error updating ${song.title}:`, err.message);
    }
  }

  await mongoose.disconnect();
  console.log("🎉 Conversion complete!");
}

convertToAuthenticated().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
