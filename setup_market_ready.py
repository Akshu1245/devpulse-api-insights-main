import os

# Define the files and their contents
files = {
    "prisma/schema.prisma": """
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id               String     @id @default(cuid())
  clerkId          String     @unique
  email            String     @unique
  enum Plan {
    FREE
    PRO
  }
  stripeCustomerId String?    @unique
      "server/server.ts": """
  import cors from "cors";
  import dotenv from "dotenv";
  import express from "express";
  import Stripe from "stripe";
  import { GoogleGenerativeAI } from "@google/generative-ai";
  import { PrismaClient } from "@prisma/client";

  dotenv.config();

  const app = express();
  const prisma = new PrismaClient();
  const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

  app.use(cors({ origin: process.env.VITE_APP_ORIGIN || "http://localhost:8080", credentials: true }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/api/generate", async (req, res) => {
    const { topic, userId, email } = req.body || {};
    if (!topic || !userId) return res.status(400).json({ error: "topic and userId are required" });
    if (!genAI) return res.status(500).json({ error: "GEMINI_API_KEY is missing" });

    const user = await prisma.user.upsert({
      where: { clerkId: userId },
      create: {
        clerkId: userId,
        email: email || `${userId}@local.devpulse`,
      },
      update: {},
    });

    const cached = await prisma.briefing.findFirst({
      where: { userId: user.id, topic },
      orderBy: { createdAt: "desc" },
    });
    if (cached) return res.json(cached.content);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(`Generate tech briefing for ${topic} in JSON format.`);
    const text = result.response.text().replace(/```json|```/g, "").trim();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { title: `Briefing: ${topic}`, summary: text, insights: [] };
    }

    await prisma.briefing.create({ data: { userId: user.id, topic, content: data } });
    return res.json(data);
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    if (!stripe) return res.status(500).json({ error: "STRIPE_SECRET_KEY is missing" });

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "DevPulse Pro" },
          unit_amount: 2900,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      mode: "subscription",
      success_url: `${process.env.VITE_APP_ORIGIN || "http://localhost:8080"}/dashboard?success=true`,
      cancel_url: `${process.env.VITE_APP_ORIGIN || "http://localhost:8080"}/billing`,
      customer_email: req.body?.email,
    });

    return res.json({ url: session.url });
  });

  app.listen(process.env.PORT || 3001, () => {
    console.log("Hybrid backend listening on port 3001");
  });
        currency: "usd",
        product_data: { name: "DevPulse Pro" },
        unit_amount: 2900,
  VITE_CLERK_PUBLISHABLE_KEY=""
      },
      quantity: 1,
    }],
  VITE_API_URL="http://localhost:3001"
  VITE_APP_ORIGIN="http://localhost:8080"
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    customer_email: user?.emailAddresses[0].emailAddress,
  });

  return Response.json({ url: session.url });
}
""",
    ".env.example": """
DATABASE_URL=""
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
GEMINI_API_KEY=""
STRIPE_SECRET_KEY=""
NEWS_API_KEY=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
"""
}

def create_files():
    for path, content in files.items():
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
        # Write the file
        with open(path, "w", encoding="utf-8") as f:
            f.write(content.strip())
        print(f"✅ Created: {path}")

if __name__ == "__main__":
    create_files()
  print("\n🚀 HYBRID MARKET-READY FILES CREATED! RUN: npm install express cors dotenv @clerk/clerk-react @google/generative-ai @prisma/client")
