// Make absolutely sure you use this for local development:
export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: false, // NOT true on localhost!
    sameSite: "lax", // NOT "none" on localhost!
    maxAge: 15 * 60 * 1000,
    path: "/",
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}
