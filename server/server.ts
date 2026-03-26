import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import Stripe from "stripe";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

const port = Number(process.env.PORT || 3001);
const clientOrigin = process.env.VITE_APP_ORIGIN || "http://localhost:8080";

const geminiApiKey = process.env.GEMINI_API_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);
app.use(helmet()); // Protects against common web vulnerabilities
app.use(compression()); // Shrinks data for "lighting speed" delivery
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "devpulse-hybrid-backend" });
});

app.post("/api/generate", async (req, res) => {
  const { topic, userId, email } = req.body ?? {};

  if (!topic || typeof topic !== "string") {
    return res.status(400).json({ error: "topic is required" });
  }
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId is required" });
  }
  if (!genAI) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
  }

  try {
    // Resolve Clerk identity into local User table before creating briefings.
    const user = await prisma.user.upsert({
      where: { clerkId: userId },
      create: {
        clerkId: userId,
        email: typeof email === "string" && email.length > 0 ? email : `${userId}@local.devpulse`,
      },
      update: {},
    });

    // Cache hit: return most recent briefing for the same user/topic.
    const cached = await prisma.briefing.findFirst({
      where: { userId: user.id, topic },
      orderBy: { createdAt: "desc" },
    });
    if (cached) {
      return res.json(cached.content);
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Generate a lightning-speed technical briefing for ${topic}. Return strict JSON with keys: title, summary, insights.`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        title: `Briefing: ${topic}`,
        summary: text,
        insights: [],
      };
    }

    await prisma.briefing.create({
      data: {
        userId: user.id,
        topic,
        content: data as object,
      },
    });

    return res.json(data);
  } catch (error) {
    console.error("/api/generate error", error);
    return res.status(500).json({ error: "Failed to generate briefing" });
  }
});

app.post("/api/stripe/checkout", async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY is not configured" });
  }

  const { email } = req.body ?? {};
  const appUrl = process.env.VITE_APP_ORIGIN || "http://localhost:8080";

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "DevPulse Pro" },
            unit_amount: 2900,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${appUrl}/dashboard?success=true`,
      cancel_url: `${appUrl}/billing`,
      customer_email: typeof email === "string" ? email : undefined,
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error("/api/stripe/checkout error", error);
    return res.status(500).json({ error: "Failed to create Stripe checkout session" });
  }
});

app.listen(port, () => {
  console.log(`Hybrid backend running on http://localhost:${port}`);
});


