// middleware/auth.js
import jwt from "jsonwebtoken";
const { JWT_ACCESS_SECRET } = process.env;

if (!JWT_ACCESS_SECRET) {
   console.error("Missing JWT_ACCESS_SECRET in env");
   process.exit(1);
}

export default function authMiddleware(req, res, next) {
   try {
      // First check cookies
      let token = req.cookies?.access_token;

      // If not in cookies, check Authorization header
      if (!token && req.headers.authorization) {
         const parts = req.headers.authorization.split(" ");
         if (parts.length === 2 && parts[0] === "Bearer") {
            token = parts[1];
         }
      }

      if (!token) {
         return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify token
      let payload;
      try {
         payload = jwt.verify(token, JWT_ACCESS_SECRET);
      } catch {
         return res.status(401).json({ error: "Unauthorized" });
      }

      req.user = {
         id: payload.sub,
         username: payload.username,
         roles: payload.roles || [],
      };

      return next();
   } catch (err) {
      console.error("authMiddleware error:", err);
      return res.status(500).json({ error: "Server error" });
   }
}
