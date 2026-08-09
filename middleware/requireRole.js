export default function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const userRoles = req.user.roles || [];
    const allowed = roles.flat();
    if (!allowed.some((r) => userRoles.includes(r))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}
