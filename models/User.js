import mongoose from "mongoose";

const RefreshTokenSchema = new mongoose.Schema({
   tokenHash: { type: String, required: true },
   expiresAt: { type: Date, required: true },
   ip: String,
   userAgent: String,
});

// 🎵 Song schema for uploaded tracks
const SongSchema = new mongoose.Schema(
   {
      title: { type: String, required: true },
      artist: { type: String, default: "Unknown Artist" },
      url: { type: String, required: true }, // Cloudinary link
      publicId: { type: String, required: true }, // Cloudinary ID for deletion
   },
   { _id: false } // avoid creating extra _id for each song
);

const UserSchema = new mongoose.Schema(
   {
      username: {
         type: String,
         required: true,
         unique: true,
         lowercase: true,
         trim: true,
         minlength: 3,
         maxlength: 48,
      },
      displayName: {
         type: String,
         trim: true,
         minlength: 1,
         maxlength: 48,
         default: function () {
            return this.username; // fallback to username
         },
      },
      email: {
         type: String,
         unique: true,
         sparse: true, // allows null
         lowercase: true,
         trim: true,
      },
      passwordHash: { type: String, required: true },

      // 👇 Avatar info
      avatarUrl: { type: String, default: "" },
      avatarPublicId: { type: String, default: "" },

      // 🎵 Songs uploaded by user
      songs: { type: [SongSchema], default: [] },

      roles: { type: [String], default: ["user"] },

      failedLoginAttempts: { type: Number, default: 0 },
      lockUntil: { type: Date },

      refreshTokens: { type: [RefreshTokenSchema], default: [] },
   },
   { timestamps: true }
);

const User = mongoose.model("User", UserSchema);
export default User;
