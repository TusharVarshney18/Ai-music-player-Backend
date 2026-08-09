import express from "express";
import mongoose from "mongoose";
import ListeningEvent from "../models/ListeningEvent.js";
import Song from "../models/Song.js";
import User from "../models/User.js";
import Like from "../models/Like.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// ───────────────────────────── USER DASHBOARD ─────────────────────────────
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const now = new Date();

    // --- Totals ---
    const totals = await ListeningEvent.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalPlays: { $sum: 1 },
          totalSeconds: { $sum: "$durationSec" },
          totalSongs: { $addToSet: "$songId" },
        },
      },
    ]);

    // --- Daily series (last 14 days) ---
    const from = new Date(now);
    from.setDate(from.getDate() - 13);
    from.setHours(0, 0, 0, 0);

    const dailyRaw = await ListeningEvent.aggregate([
      { $match: { userId, listenedAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$listenedAt" } },
          plays: { $sum: 1 },
          seconds: { $sum: "$durationSec" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyMap = new Map(dailyRaw.map((d) => [d._id, d]));
    const daily = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      daily.push({
        date: key,
        plays: dailyMap.get(key)?.plays || 0,
        seconds: dailyMap.get(key)?.seconds || 0,
      });
    }

    // --- Top artists / genres (lifetime) ---
    const topArtists = await ListeningEvent.aggregate([
      { $match: { userId } },
      { $lookup: { from: "songs", localField: "songId", foreignField: "_id", as: "song" } },
      { $unwind: { path: "$song", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$song.artist",
          plays: { $sum: 1 },
          seconds: { $sum: "$durationSec" },
          cover: { $first: "$song.cover" },
        },
      },
      { $sort: { plays: -1 } },
      { $limit: 8 },
    ]);

    const topGenres = await ListeningEvent.aggregate([
      { $match: { userId } },
      { $lookup: { from: "songs", localField: "songId", foreignField: "_id", as: "song" } },
      { $unwind: { path: "$song", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$song.genre",
          plays: { $sum: 1 },
          seconds: { $sum: "$durationSec" },
        },
      },
      { $sort: { plays: -1 } },
      { $limit: 8 },
    ]);

    // --- Top songs ---
    const topSongsAgg = await ListeningEvent.aggregate([
      { $match: { userId } },
      { $group: { _id: "$songId", plays: { $sum: 1 }, seconds: { $sum: "$durationSec" } } },
      { $sort: { plays: -1 } },
      { $limit: 10 },
      { $lookup: { from: "songs", localField: "_id", foreignField: "_id", as: "song" } },
      { $unwind: { path: "$song", preserveNullAndEmptyArrays: false } },
      {
        $project: {
          plays: 1,
          seconds: 1,
          title: "$song.title",
          artist: "$song.artist",
          cover: "$song.cover",
          duration: "$song.duration",
        },
      },
    ]);

    // --- Recent listens ---
    const recent = await ListeningEvent.find({ userId })
      .sort({ listenedAt: -1 })
      .limit(20)
      .populate({ path: "songId", populate: { path: "uploadedBy", select: "username displayName" } });

    const recentListens = recent.map((e) => ({
      listenedAt: e.listenedAt,
      durationSec: e.durationSec,
      song: e.songId,
    }));

    // --- Listening streak ---
    let streak = 0;
    const listenDates = await ListeningEvent.distinct("listenedAt", { userId }).then((dates) =>
      dates.map((d) => new Date(d).toISOString().slice(0, 10))
    );
    const set = new Set(listenDates);
    let cursor = new Date(now).toISOString().slice(0, 10);
    if (!set.has(cursor)) {
      // allow today to not break a streak — check yesterday
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      cursor = y.toISOString().slice(0, 10);
    }
    while (set.has(cursor)) {
      streak++;
      const d = new Date(cursor);
      d.setDate(d.getDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    }

    const t = totals[0] || { totalPlays: 0, totalSeconds: 0, totalSongs: [] };

    res.json({
      totals: {
        totalPlays: t.totalPlays,
        totalSeconds: t.totalSeconds,
        totalMinutes: Math.round(t.totalSeconds / 60),
        totalSongs: t.totalSongs?.length || 0,
      },
      daily,
      topArtists,
      topGenres: topGenres.filter((g) => g._id && g._id !== "Unknown"),
      topSongs: topSongsAgg,
      recentListens: recentListens.filter((r) => r.song),
      streak,
    });
  } catch (err) {
    console.error("Stats/me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────── CREATOR DASHBOARD ───────────────────────────
router.get("/creator", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const songs = await Song.find({ uploadedBy: userId })
      .sort({ createdAt: -1 })
      .select("title artist album cover genre plays likesCount duration createdAt");

    const totals = songs.reduce(
      (acc, s) => {
        acc.plays += s.plays || 0;
        acc.likes += s.likesCount || 0;
        return acc;
      },
      { plays: 0, likes: 0 }
    );

    // uploads per day (last 14 days)
    const from = new Date();
    from.setDate(from.getDate() - 13);
    from.setHours(0, 0, 0, 0);

    const uploadRaw = await Song.aggregate([
      { $match: { uploadedBy: new mongoose.Types.ObjectId(userId), createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const uploadMap = new Map(uploadRaw.map((d) => [d._id, d.count]));
    const uploadDaily = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      uploadDaily.push({
        date: d.toISOString().slice(0, 10),
        count: uploadMap.get(d.toISOString().slice(0, 10)) || 0,
      });
    }

    res.json({
      totals: { songs: songs.length, plays: totals.plays, likes: totals.likes },
      songs,
      uploadDaily,
    });
  } catch (err) {
    console.error("Stats/creator error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ───────────────────────────── ADMIN DASHBOARD ─────────────────────────────
router.get("/admin", authMiddleware, async (req, res) => {
  try {
    if (!req.user.roles?.includes("admin")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [songCount, userCount, playAgg, likeCount, eventCount] = await Promise.all([
      Song.countDocuments(),
      User.countDocuments(),
      Song.aggregate([{ $group: { _id: null, plays: { $sum: "$plays" }, likes: { $sum: "$likesCount" } } }]),
      Like.countDocuments(),
      ListeningEvent.countDocuments(),
    ]);

    // uploads per day (last 14 days)
    const from = new Date();
    from.setDate(from.getDate() - 13);
    from.setHours(0, 0, 0, 0);

    const uploadRaw = await Song.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const uploadMap = new Map(uploadRaw.map((d) => [d._id, d.count]));
    const uploadDaily = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      uploadDaily.push({
        date: d.toISOString().slice(0, 10),
        count: uploadMap.get(d.toISOString().slice(0, 10)) || 0,
      });
    }

    // user growth (last 14 days)
    const userRaw = await User.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const userMap = new Map(userRaw.map((d) => [d._id, d.count]));
    const userDaily = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      userDaily.push({
        date: d.toISOString().slice(0, 10),
        count: userMap.get(d.toISOString().slice(0, 10)) || 0,
      });
    }

    // plays leaderboard
    const topSongs = await Song.find().sort({ plays: -1 }).limit(10).select("title artist cover plays likesCount genre");

    // top genres
    const topGenres = await Song.aggregate([
      { $match: { genre: { $nin: ["Unknown", "", null] } } },
      { $group: { _id: "$genre", songs: { $sum: 1 }, plays: { $sum: "$plays" } } },
      { $sort: { songs: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      totals: {
        songs: songCount,
        users: userCount,
        plays: playAgg[0]?.plays || 0,
        likes: playAgg[0]?.likes || 0,
        likeRecords: likeCount,
        events: eventCount,
      },
      uploadDaily,
      userDaily,
      topSongs,
      topGenres,
    });
  } catch (err) {
    console.error("Stats/admin error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
