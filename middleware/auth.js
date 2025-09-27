// middleware/auth.js
import jwt from "jsonwebtoken";
const { JWT_ACCESS_SECRET } = process.env;

if (!JWT_ACCESS_SECRET) {
   console.error("Missing JWT_ACCESS_SECRET in env");
   process.exit(1);
}

export default function authMiddleware(req, res, next) {
   try {
      // 🔑 Look for access_token in cookies first
      let token = req.cookies?.access_token;

      // Or in Authorization header
      if (!token && req.headers.authorization) {
         const parts = req.headers.authorization.split(" ");
         if (parts.length === 2 && parts[0] === "Bearer") {
            token = parts[1];
         }
      }

      if (!token) {
         return res.status(401).json({ error: "Unauthorized" });
      }

      // ✅ Verify access token
      const payload = jwt.verify(token, JWT_ACCESS_SECRET);

      req.user = {
         id: payload.sub || payload.id,
         username: payload.username,
         roles: payload.roles || [],
      };

      return next();
   } catch (err) {
      // ⏰ If expired, frontend will catch 401 and call /auth/refresh
      if (err.name === "TokenExpiredError") {
         return res.status(401).json({ error: "Token expired" });
      }
      console.error("authMiddleware error:", err);
      return res.status(401).json({ error: "Unauthorized" });
   }
}
