// utils/authCookies.js
export function setAuthCookies(res, accessToken, refreshToken) {
   const isProd = process.env.NODE_ENV === "production";

   res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: isProd, // only force secure in prod
      sameSite: isProd ? "none" : "lax", // allow cross-site cookies
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/", // important for all routes
   });

   res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
   });
}
