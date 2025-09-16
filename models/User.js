import mongoose from "mongoose";

const RefreshTokenSchema = new mongoose.Schema({
   tokenHash: { type: String, required: true },
   expiresAt: { type: Date, required: true },
   ip: String,
   userAgent: String,
});

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
      passwordHash: { type: String, required: true },
      roles: { type: [String], default: ["user"] },

      failedLoginAttempts: { type: Number, default: 0 },
      lockUntil: { type: Date },

      refreshTokens: { type: [RefreshTokenSchema], default: [] },
   },
   { timestamps: true }
);

const User = mongoose.model("User", UserSchema);
export default User;
