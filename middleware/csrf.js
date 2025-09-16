import csrf from "csurf";

const csrfProtection = csrf({
   cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax", // 👈 allow cross-origin in dev
   },
});

export default csrfProtection;
