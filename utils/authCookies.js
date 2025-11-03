// utils/authCookies.js
export function setAuthCookies(res, accessToken, refreshToken) {
  // ✅ Vercel/Production settings: HTTPS with sameSite: "none"
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: true, // ✅ HTTPS required on Vercel
    sameSite: "none", // ✅ Allow cross-origin cookies
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: "/",
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: true, // ✅ HTTPS required on Vercel
    sameSite: "none", // ✅ Allow cross-origin cookies
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  console.log("✅ Auth cookies set (Vercel production mode)");
}
