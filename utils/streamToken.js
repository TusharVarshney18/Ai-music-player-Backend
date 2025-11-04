// utils/streamToken.js
import jwt from "jsonwebtoken";

const { STREAM_SECRET = "change-me" } = process.env;

export function signStreamToken({ userId, songId, ttlSeconds = 60 }) {
  return jwt.sign(
    { sub: userId, sid: songId }, // sid = song id
    STREAM_SECRET,
    { expiresIn: ttlSeconds }
  );
}

export function verifyStreamToken(token) {
  return jwt.verify(token, STREAM_SECRET);
}
