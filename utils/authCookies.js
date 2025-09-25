// utils/authCookies.js
export function setAuthCookies(res, accessToken, refreshToken) {
   // ✅ Access token cookie (short-lived)
   res.cookie("access_token", accessToken, {
      httpOnly: true,       // prevent JS access
      secure: process.env.NODE_ENV === "production", // required on Vercel
      sameSite: "none",     // ✅ allow cross-domain cookies (frontend <> backend)
      path: "/",
      maxAge: 15 * 60 * 1000, // 15 minutes
   });

   // ✅ Refresh token cookie (long-lived)
   res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
   });
}
