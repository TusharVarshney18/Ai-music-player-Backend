// utils/authCookies.js
export function setAuthCookies(res, accessToken, refreshToken) {
   res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: true,           // ✅ must always be true on Vercel/production
      sameSite: "none",       // ✅ required for cross-site cookies
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",              // ✅ allow all routes
   });

   res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
   });
}
