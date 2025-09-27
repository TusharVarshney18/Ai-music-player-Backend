// utils/authCookies.js
export function setAuthCookies(res, accessToken, refreshToken) {
   res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: true, // ✅ required in production (HTTPS)
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 minutes
   });

   res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
   });
}
