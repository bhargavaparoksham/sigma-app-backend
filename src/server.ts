import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import passport from "passport";
import session from "express-session";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const prisma = new PrismaClient();

const app = express();

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_session_secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Passport Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await prisma.user.findUnique({
          where: { googleId: profile.id },
        });
        if (!user) {
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email: profile.emails![0].value,
              name: profile.displayName,
              picture: profile.photos![0].value,
            },
          });
        }
        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (error) {
    done(error as Error);
  }
});

// Auth Routes
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect(`${process.env.CLIENT_URL}/profile`);
  }
);

app.get("/api/user", (req, res) => {
  res.json(req.user || null);
});

app.get("/api/logout", (req, res) => {
  req.logout(() => {
    res.json({ message: "Logged out successfully" });
  });
});

// Waitlist Endpoints
app.post("/api/waitlist", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const newEntry = await prisma.waitlist.create({
      data: { email },
    });
    res.status(201).json({ message: "Successfully added to waitlist" });
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ error: "Email already exists in waitlist" });
    } else {
      console.error("Error adding to waitlist:", error);
      res.status(500).json({ error: "Error adding to waitlist" });
    }
  }
});

app.get("/api/waitlist", async (req, res) => {
  try {
    const waitlist = await prisma.waitlist.findMany({
      select: { email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(waitlist);
  } catch (error) {
    console.error("Error fetching waitlist:", error);
    res.status(500).json({ error: "Error fetching waitlist" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
