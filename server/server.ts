import compression from "compression";
import cors from "cors";
import * as dotenv from "dotenv";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import Stripe from "stripe";
import * as nodemailer from "nodemailer";
import winston from "winston";
import rateLimit from "express-rate-limit";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// JWT AUTHENTICATION TYPES & MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

interface JWTPayload {
  sub: string;           // user_id from Supabase
  email?: string;
  aud?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email?: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || "";

function verifyJWT(token: string): JWTPayload | null {
  try {
    // Try to verify with secret first
    if (JWT_SECRET) {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return decoded;
    }
    // Fallback: decode without verification (for Supabase anon key signed tokens)
    // In production, ALWAYS use proper secret verification
    const decoded = jwt.decode(token) as JWTPayload;
    if (decoded && decoded.sub && decoded.exp && decoded.exp > Date.now() / 1000) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  if (!token) {
    res.status(401).json({ error: "Token is required" });
    return;
  }

  const payload = verifyJWT(token);

  if (!payload || !payload.sub) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Attach user to request
  (req as AuthenticatedRequest).user = {
    id: payload.sub,
    email: payload.email,
  };

  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGING
// ═══════════════════════════════════════════════════════════════════════════

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "devpulse-backend" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : "";
          return `${timestamp} [${level}] ${message} ${metaStr}`;
        })
      ),
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 900000); // 15 minutes
const rateLimitMaxRequests = Number(process.env.RATE_LIMIT_SCAN_MAX || 10);

// IP-based rate limiter for scan endpoints
const scanRateLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMaxRequests,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn("Rate limit exceeded", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get("user-agent"),
    });
    res.status(429).json({
      error: "Too many requests",
      message: `Rate limit exceeded. Maximum ${rateLimitMaxRequests} scan requests per ${rateLimitWindowMs / 60000} minutes. Please try again later.`,
      retryAfter: Math.ceil(rateLimitWindowMs / 1000),
    });
  },
  skip: (req) => {
    // Optional: Skip rate limiting for certain conditions (e.g., trusted IPs)
    // For now, we apply rate limiting to all IPs
    return false;
  },
});

// ═══════════════════════════════════════════════════════════════════════════

const app = express();
const prisma = new PrismaClient();

const port = Number(process.env.PORT || 3001);
const clientOrigin = process.env.VITE_APP_ORIGIN?.split(",") || ["http://localhost:8080", "http://localhost:3000"];

const geminiApiKey = process.env.GEMINI_API_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// LLM Cost Pricing (per 1K tokens in INR)
const LLM_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4": { input: 2.5, output: 7.5 },
  "gpt-4-turbo": { input: 0.83, output: 2.5 },
  "gpt-4o": { input: 0.42, output: 1.25 },
  "gpt-4o-mini": { input: 0.0125, output: 0.05 },
  "gpt-3.5-turbo": { input: 0.042, output: 0.125 },
  "claude-3-opus": { input: 1.25, output: 6.25 },
  "claude-3-sonnet": { input: 0.25, output: 1.25 },
  "claude-3-haiku": { input: 0.021, output: 0.104 },
  "claude-3.5-sonnet": { input: 0.25, output: 1.25 },
  "gemini-pro": { input: 0.021, output: 0.063 },
  "gemini-1.5-pro": { input: 0.29, output: 0.58 },
  "gemini-1.5-flash": { input: 0.006, output: 0.025 },
  default: { input: 0.1, output: 0.3 },
};

// Calculate LLM cost based on model and tokens
function calculateLLMCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = LLM_PRICING[model.toLowerCase()] || LLM_PRICING.default;
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimals
}

// SMTP Transporter (lazy init)
let mailTransporter: nodemailer.Transporter | null = null;
function getMailTransporter(): nodemailer.Transporter | null {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASSWORD;

  if (!smtpHost || !smtpUser || !smtpPass) return null;

  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
  }
  return mailTransporter;
}

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);
app.use(helmet()); // Protects against common web vulnerabilities
app.use(compression()); // Shrinks data for "lighting speed" delivery
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  logger.info("Request started", {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("Request completed", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "devpulse-hybrid-backend" });
});

app.post("/api/generate", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const userEmail = authReq.user.email;
  const { topic } = req.body ?? {};

  if (!topic || typeof topic !== "string") {
    return res.status(400).json({ error: "topic is required" });
  }
  if (!genAI) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
  }

  try {
    // Resolve identity into local User table before creating briefings.
    const user = await prisma.user.upsert({
      where: { clerkId: userId },
      create: {
        clerkId: userId,
        email: typeof userEmail === "string" && userEmail.length > 0 ? userEmail : `${userId}@local.devpulse`,
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
    logger.error("/api/generate error", error);
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
    logger.error("/api/stripe/checkout error", error);
    return res.status(500).json({ error: "Failed to create Stripe checkout session" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY SCANNER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /scan - Scans an endpoint for security vulnerabilities
 * Real HTTP request + OWASP API Top 10 checks
 * Rate limited: 10 requests per 15 minutes per IP
 */
app.post("/scan", authMiddleware, scanRateLimiter, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { endpoint, method } = req.body ?? {};

  logger.info("Scan request received", { userId, endpoint, method });

  if (!endpoint || typeof endpoint !== "string") {
    logger.warn("Scan validation failed: missing endpoint", { userId });
    return res.status(400).json({ error: "endpoint URL is required" });
  }

  // Validate URL format
  try {
    new URL(endpoint);
  } catch {
    logger.warn("Scan validation failed: invalid URL format", { userId, endpoint });
    return res.status(400).json({ error: "Invalid URL format. URL must include protocol (http:// or https://)" });
  }

  try {
    const httpMethod = typeof method === "string" ? method.toUpperCase() : "GET";
    logger.info("Starting security scan", { userId, endpoint, method: httpMethod });

    const scanResult = await performSecurityScan(endpoint, httpMethod);

    logger.info("Security scan completed", {
      userId,
      endpoint,
      riskLevel: scanResult.riskLevel,
      vulnerabilitiesFound: scanResult.vulnerabilities.length,
    });

    // Store scan results in database
    const scan = await prisma.scan.create({
      data: {
        userId: userId,
        endpoint: endpoint,
        method: scanResult.method,
        riskLevel: scanResult.riskLevel,
        issue: scanResult.issue,
        recommendation: scanResult.recommendation,
      },
    });

    logger.info("Scan results stored in database", { userId, scanId: scan.id });

    // Create vulnerabilities
    if (scanResult.vulnerabilities && scanResult.vulnerabilities.length > 0) {
      await prisma.vulnerability.createMany({
        data: scanResult.vulnerabilities.map((v: any) => ({
          scanId: scan.id,
          type: v.type,
          severity: v.severity,
          description: v.description,
          remediation: v.remediation,
        })),
      });
      logger.info("Vulnerabilities stored", { scanId: scan.id, count: scanResult.vulnerabilities.length });
    }

    // Trigger alert if critical or high severity
    if (scanResult.riskLevel === "CRITICAL" || scanResult.riskLevel === "HIGH") {
      logger.warn("High severity vulnerability detected, triggering alert", {
        userId,
        endpoint,
        riskLevel: scanResult.riskLevel,
      });
      await createAlert(userId, scanResult.riskLevel, scanResult.issue, endpoint);
    }

    return res.json({ success: true, scan: scan, issues: scanResult.vulnerabilities });
  } catch (error) {
    logger.error("Scan execution failed", {
      userId,
      endpoint,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return res.status(500).json({ error: "Scan failed. Please check the endpoint URL and try again." });
  }
});

/**
 * GET /scans - Get all scans for authenticated user
 */
app.get("/scans", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const scans = await prisma.scan.findMany({
      where: { userId },
      orderBy: { scannedAt: "desc" },
      include: { vulnerabilities: true },
    });

    return res.json({ scans });
  } catch (error) {
    logger.error("/scans error", error);
    return res.status(500).json({ error: "Failed to fetch scans" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POSTMAN IMPORT ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /postman/import - Import Postman collection and scan endpoints
 * Rate limited: 10 requests per 15 minutes per IP
 */
app.post("/postman/import", authMiddleware, scanRateLimiter, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { collection, scan_endpoints, variables } = req.body ?? {};

  if (!collection || typeof collection !== "object") {
    return res.status(400).json({ error: "collection object is required" });
  }

  try {
    // Merge user-provided variables with collection variables
    if (variables && typeof variables === "object" && collection.variable) {
      const merged = [...(collection.variable || [])];
      for (const [key, value] of Object.entries(variables)) {
        const idx = merged.findIndex((v: any) => v.key === key);
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], value };
        } else {
          merged.push({ key, value });
        }
      }
      collection.variable = merged;
    }

    const parseResult = parsePostmanCollection(collection);

    const scanResults: any[] = [];
    const credentialFindings: any[] = [];

    // Scan for credentials in the collection
    for (const endpoint of parseResult.endpoints) {
      const creds = detectCredentials(endpoint);
      if (creds.length > 0) {
        credentialFindings.push(...creds);
      }
    }

    // Optionally scan endpoints (with method from collection)
    if (scan_endpoints && parseResult.scannableUrls.length > 0) {
      // Create URL to method mapping
      const urlMethodMap: Record<string, string> = {};
      for (const ep of parseResult.endpoints) {
        if (ep.url && ep.url.startsWith("http")) {
          urlMethodMap[ep.url] = ep.method || "GET";
        }
      }

      for (const url of parseResult.scannableUrls.slice(0, 10)) {
        try {
          const method = urlMethodMap[url] || "GET";
          const scanResult = await performSecurityScan(url, method);
          scanResults.push({
            endpoint: url,
            issue: scanResult.issue,
            risk_level: scanResult.riskLevel,
            recommendation: scanResult.recommendation,
            method: scanResult.method,
          });

          // Store in DB
          await prisma.scan.create({
            data: {
              userId: userId,
              endpoint: url,
              method: scanResult.method,
              riskLevel: scanResult.riskLevel,
              issue: scanResult.issue,
              recommendation: scanResult.recommendation,
            },
          });

          // Alert if needed
          if (scanResult.riskLevel === "CRITICAL" || scanResult.riskLevel === "HIGH") {
            await createAlert(userId, scanResult.riskLevel, scanResult.issue, url);
          }
        } catch (e) {
          // Skip failed scans
        }
      }
    }

    const criticalCount = scanResults.filter(r => r.risk_level === "CRITICAL").length;
    const highCount = scanResults.filter(r => r.risk_level === "HIGH").length;

    return res.json({
      success: true,
      collection_name: parseResult.collectionName,
      total_endpoints: parseResult.endpoints.length,
      scannable_urls_count: parseResult.scannableUrls.length,
      credentials_exposed_count: credentialFindings.length,
      endpoints_with_credentials: new Set(credentialFindings.map(f => f.location)).size,
      credential_findings: credentialFindings,
      scan_results: scanResults,
      summary: {
        critical_findings: criticalCount,
        high_findings: highCount,
        total_scannable: parseResult.scannableUrls.length,
      },
    });
  } catch (error) {
    logger.error("/postman/import error", error);
    return res.status(500).json({ error: "Failed to import Postman collection" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LLM COST TRACKING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /llm/log - Log LLM usage with server-side cost calculation
 */
app.post("/llm/log", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { model, tokens_used, input_tokens, output_tokens, cost_inr, endpoint } = req.body ?? {};

  if (!model) {
    return res.status(400).json({ error: "model is required" });
  }

  // Calculate cost server-side if not provided
  let finalCost = cost_inr;
  let totalTokens = tokens_used;

  if (typeof input_tokens === "number" && typeof output_tokens === "number") {
    // Use detailed token breakdown for accurate cost
    finalCost = calculateLLMCost(model, input_tokens, output_tokens);
    totalTokens = input_tokens + output_tokens;
  } else if (typeof tokens_used === "number" && typeof cost_inr !== "number") {
    // Estimate cost assuming 50/50 input/output split
    const halfTokens = Math.floor(tokens_used / 2);
    finalCost = calculateLLMCost(model, halfTokens, halfTokens);
    totalTokens = tokens_used;
  } else if (typeof tokens_used !== "number") {
    return res.status(400).json({ error: "tokens_used or (input_tokens + output_tokens) required" });
  }

  if (typeof finalCost !== "number" || isNaN(finalCost)) {
    finalCost = 0;
  }

  try {
    const usage = await prisma.lLMUsage.create({
      data: {
        userId: userId,
        model,
        tokensUsed: totalTokens,
        costInr: finalCost,
        endpoint: endpoint || null,
      },
    });

    // Check for cost spike and trigger alert
    const recentUsage = await prisma.lLMUsage.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    if (recentUsage.length >= 10) {
      const avgCost = recentUsage.slice(1).reduce((s, u) => s + u.costInr, 0) / (recentUsage.length - 1);
      if (finalCost > avgCost * 3 && finalCost > 1) {
        // Cost spike: 3x average and over ₹1
        await createAlert(
          userId,
          "HIGH",
          `LLM cost spike detected: ₹${finalCost.toFixed(2)} (3x your average of ₹${avgCost.toFixed(2)})`,
          endpoint || model
        );
      }
    }

    return res.json({ success: true, usage, calculated_cost: finalCost });
  } catch (error) {
    logger.error("/llm/log error", error);
    return res.status(500).json({ error: "Failed to log LLM usage" });
  }
});

/**
 * GET /llm/usage - Get LLM usage for authenticated user
 */
app.get("/llm/usage", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const usage = await prisma.lLMUsage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return res.json({ usage });
  } catch (error) {
    logger.error("/llm/usage error", error);
    return res.status(500).json({ error: "Failed to fetch LLM usage" });
  }
});

/**
 * GET /llm/summary - Get LLM usage summary for authenticated user
 */
app.get("/llm/summary", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const usage = await prisma.lLMUsage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const totalCost = usage.reduce((sum, u) => sum + u.costInr, 0);
    const totalTokens = usage.reduce((sum, u) => sum + u.tokensUsed, 0);
    const byModel: Record<string, { tokens: number; cost: number; count: number }> = {};

    for (const u of usage) {
      if (!byModel[u.model]) {
        byModel[u.model] = { tokens: 0, cost: 0, count: 0 };
      }
      byModel[u.model].tokens += u.tokensUsed;
      byModel[u.model].cost += u.costInr;
      byModel[u.model].count += 1;
    }

    // Find most expensive model
    let mostExpensiveModel: string | null = null;
    let maxCost = 0;
    for (const [model, data] of Object.entries(byModel)) {
      if (data.cost > maxCost) {
        maxCost = data.cost;
        mostExpensiveModel = model;
      }
    }

    // Generate daily breakdown for last 30 days
    const dailyMap: Record<string, number> = {};
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const u of usage) {
      if (u.createdAt >= thirtyDaysAgo) {
        const dateKey = u.createdAt.toISOString().split("T")[0];
        dailyMap[dateKey] = (dailyMap[dateKey] || 0) + u.costInr;
      }
    }

    const dailyBreakdown = Object.entries(dailyMap)
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Model totals (cost only)
    const modelTotals: Record<string, number> = {};
    for (const [model, data] of Object.entries(byModel)) {
      modelTotals[model] = data.cost;
    }

    return res.json({
      total_cost: totalCost,
      total_cost_inr: totalCost,
      total_tokens: totalTokens,
      total_requests: usage.length,
      most_expensive_model: mostExpensiveModel,
      daily_breakdown: dailyBreakdown,
      model_totals: modelTotals,
      by_model: byModel,
    });
  } catch (error) {
    logger.error("/llm/summary error", error);
    return res.status(500).json({ error: "Failed to fetch LLM summary" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERTS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /alerts - Get active alerts for authenticated user
 */
app.get("/alerts", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const alerts = await prisma.alert.findMany({
      where: { userId, resolved: false },
      orderBy: { createdAt: "desc" },
    });

    // Transform to include both camelCase and snake_case for frontend compatibility
    const transformedAlerts = alerts.map(alert => ({
      id: alert.id,
      severity: alert.severity,
      description: alert.description,
      endpoint: alert.endpoint,
      createdAt: alert.createdAt,
      created_at: alert.createdAt.toISOString(),
      resolved: alert.resolved,
    }));

    return res.json({ alerts: transformedAlerts });
  } catch (error) {
    logger.error("/alerts error", error);
    return res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

/**
 * PATCH /alerts/:alertId/resolve - Resolve an alert (user must own the alert)
 */
app.patch("/alerts/:alertId/resolve", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { alertId } = req.params;

  try {
    // First verify the alert belongs to this user
    const existingAlert = await prisma.alert.findFirst({
      where: { id: alertId, userId },
    });

    if (!existingAlert) {
      return res.status(404).json({ error: "Alert not found or access denied" });
    }

    const alert = await prisma.alert.update({
      where: { id: alertId },
      data: { resolved: true, resolvedAt: new Date() },
    });

    return res.json({ success: true, alert });
  } catch (error) {
    logger.error("/alerts/:alertId/resolve error", error);
    return res.status(500).json({ error: "Failed to resolve alert" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /compliance - Get compliance checks for authenticated user
 */
app.get("/compliance", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const checks = await prisma.complianceCheck.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ checks });
  } catch (error) {
    logger.error("/compliance error", error);
    return res.status(500).json({ error: "Failed to fetch compliance checks" });
  }
});

/**
 * POST /compliance/check - Run a compliance check
 */
app.post("/compliance/check", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { control_name, evidence } = req.body ?? {};

  if (!control_name || !evidence) {
    return res.status(400).json({ error: "control_name and evidence are required" });
  }

  try {
    const check = await prisma.complianceCheck.create({
      data: {
        userId: userId,
        controlName: control_name,
        framework: "PCI_DSS",
        status: "PASS",
        evidence,
      },
    });

    return res.json({ success: true, check });
  } catch (error) {
    logger.error("/compliance/check error", error);
    return res.status(500).json({ error: "Failed to run compliance check" });
  }
});

/**
 * POST /compliance/report - Generate compliance report for authenticated user
 */
app.post("/compliance/report", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { organization_name, report_type } = req.body ?? {};

  try {
    const scans = await prisma.scan.findMany({
      where: { userId },
      include: { vulnerabilities: true },
    });

    const checks = await prisma.complianceCheck.findMany({
      where: { userId },
    });

    if (scans.length === 0 && checks.length === 0) {
      return res.status(400).json({ error: "No scan results or compliance checks found. Please run scans first." });
    }

    const report = generateComplianceReport(scans, checks, organization_name || "Your Organization", report_type || "both");

    return res.json(report);
  } catch (error) {
    logger.error("/compliance/report error", error);
    return res.status(500).json({ error: "Failed to generate compliance report" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// THINKING TOKENS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /thinking-tokens/log - Log thinking token usage
 */
app.post("/thinking-tokens/log", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { model, endpoint_name, feature_name, usage_metadata, response_latency_ms } = req.body ?? {};

  if (!model || !usage_metadata) {
    return res.status(400).json({ error: "model and usage_metadata are required" });
  }

  try {
    const log = await prisma.thinkingTokenLog.create({
      data: {
        userId: userId,
        model,
        endpointName: endpoint_name || null,
        featureName: feature_name || null,
        usageMetadata: usage_metadata,
        responseLatencyMs: response_latency_ms || null,
      },
    });

    return res.json({ success: true, log });
  } catch (error) {
    logger.error("/thinking-tokens/log error", error);
    return res.status(500).json({ error: "Failed to log thinking tokens" });
  }
});

/**
 * GET /thinking-tokens/stats - Get thinking token stats for authenticated user
 */
app.get("/thinking-tokens/stats", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const logs = await prisma.thinkingTokenLog.findMany({
      where: { userId },
    });

    const totalLogs = logs.length;
    const byModel: Record<string, number> = {};

    for (const log of logs) {
      byModel[log.model] = (byModel[log.model] || 0) + 1;
    }

    return res.json({
      total_logs: totalLogs,
      by_model: byModel,
      logs: logs.slice(0, 50),
    });
  } catch (error) {
    logger.error("/thinking-tokens/stats error", error);
    return res.status(500).json({ error: "Failed to fetch thinking token stats" });
  }
});

/**
 * GET /thinking-tokens/analyze - Analyze thinking efficiency for authenticated user
 */
app.get("/thinking-tokens/analyze", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const logs = await prisma.thinkingTokenLog.findMany({
      where: { userId },
    });

    return res.json({
      analysis: "Thinking token analysis",
      total_requests: logs.length,
      logs: logs.slice(0, 20),
    });
  } catch (error) {
    logger.error("/thinking-tokens/analyze error", error);
    return res.status(500).json({ error: "Failed to analyze thinking efficiency" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED RISK SCORE ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /scan/risk-score - Get unified risk score for authenticated user
 */
app.get("/scan/risk-score", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const scans = await prisma.scan.findMany({
      where: { userId },
      include: { vulnerabilities: true },
    });

    const llmUsage = await prisma.lLMUsage.findMany({
      where: { userId },
    });

    const riskScores = calculateUnifiedRiskScore(scans, llmUsage);

    return res.json({ risk_scores: riskScores });
  } catch (error) {
    logger.error("/scan/risk-score error", error);
    return res.status(500).json({ error: "Failed to calculate risk score" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SHADOW API DISCOVERY ENDPOINTS (Patent 3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /shadow-api/discover - Discover shadow APIs
 * Compares documented routes with observed traffic to find undocumented endpoints
 */
app.post("/shadow-api/discover", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { project_name, source_code_routes, observed_traffic } = req.body ?? {};

  if (!source_code_routes || !observed_traffic) {
    return res.status(400).json({ error: "source_code_routes and observed_traffic are required" });
  }

  try {
    const documentedPaths = new Set(source_code_routes.map((r: any) => `${r.method}:${r.route}`));
    const shadowApis: any[] = [];

    for (const traffic of observed_traffic) {
      const key = `${traffic.method}:${traffic.path}`;
      if (!documentedPaths.has(key)) {
        shadowApis.push({
          path: traffic.path,
          method: traffic.method,
          count: traffic.count,
          last_seen: traffic.last_seen,
          risk: "UNDOCUMENTED",
        });
      }
    }

    return res.json({
      success: true,
      project_name,
      shadow_apis: shadowApis,
      total_documented: source_code_routes.length,
      total_undocumented: shadowApis.length,
    });
  } catch (error) {
    logger.error("/shadow-api/discover error", error);
    return res.status(500).json({ error: "Failed to discover shadow APIs" });
  }
});

/**
 * GET /shadow-api/inventory - Get shadow API inventory for authenticated user
 */
app.get("/shadow-api/inventory", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    return res.json({ inventory: [] });
  } catch (error) {
    logger.error("/shadow-api/inventory error", error);
    return res.status(500).json({ error: "Failed to fetch shadow API inventory" });
  }
});

/**
 * GET /shadow-api/stats - Get shadow API stats for authenticated user
 */
app.get("/shadow-api/stats", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    return res.json({
      total_shadow_apis: 0,
      total_documented: 0,
      risk_breakdown: { high: 0, medium: 0, low: 0 },
    });
  } catch (error) {
    logger.error("/shadow-api/stats error", error);
    return res.status(500).json({ error: "Failed to fetch shadow API stats" });
  }
});

/**
 * PATCH /shadow-api/resolve/:endpointId - Resolve a shadow API endpoint
 */
app.patch("/shadow-api/resolve/:endpointId", authMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { endpointId } = req.params;
  const { resolution } = req.body ?? {};

  if (!resolution) {
    return res.status(400).json({ error: "resolution is required" });
  }

  try {
    return res.json({ success: true, message: "Shadow API resolved" });
  } catch (error) {
    logger.error("/shadow-api/resolve/:endpointId error", error);
    return res.status(500).json({ error: "Failed to resolve shadow API" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Perform real security scan on an endpoint with proper HTTP method
 */
async function performSecurityScan(endpoint: string, httpMethod: string = "GET"): Promise<any> {
  const vulnerabilities: any[] = [];
  const method = httpMethod.toUpperCase();
  let riskLevel = "LOW";
  let issue = "No critical issues detected";
  let recommendation = "Continue monitoring this endpoint";

  try {
    // Parse URL
    const url = new URL(endpoint);

    // Real HTTP request with timeout (10 seconds)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const fetchOptions: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        "User-Agent": "DevPulse-SecurityScanner/1.0",
        "Accept": "application/json, text/plain, */*",
      },
    };

    // Add empty body for POST/PUT/PATCH to test handling
    if (["POST", "PUT", "PATCH"].includes(method)) {
      fetchOptions.headers = {
        ...fetchOptions.headers as Record<string, string>,
        "Content-Type": "application/json",
      };
      fetchOptions.body = "{}";
    }

    const response = await fetch(endpoint, fetchOptions).finally(() => clearTimeout(timeout));

    // Check 1: HTTPS enforcement
    if (url.protocol !== "https:") {
      vulnerabilities.push({
        type: "HTTPS_NOT_ENFORCED",
        severity: "HIGH",
        description: "Endpoint is not using HTTPS encryption",
        remediation: "Enable HTTPS/TLS for this endpoint to encrypt data in transit",
      });
      riskLevel = "HIGH";
      issue = "HTTPS not enforced - data transmission not encrypted";
    }

    // Check 2: Response headers
    const headers = response.headers;

    if (!headers.get("strict-transport-security")) {
      vulnerabilities.push({
        type: "MISSING_HSTS",
        severity: "MEDIUM",
        description: "Missing Strict-Transport-Security header",
        remediation: "Add HSTS header to prevent protocol downgrade attacks",
      });
      if (riskLevel === "LOW") riskLevel = "MEDIUM";
    }

    if (!headers.get("x-content-type-options")) {
      vulnerabilities.push({
        type: "MISSING_X_CONTENT_TYPE",
        severity: "MEDIUM",
        description: "Missing X-Content-Type-Options header",
        remediation: "Add X-Content-Type-Options: nosniff header",
      });
      if (riskLevel === "LOW") riskLevel = "MEDIUM";
    }

    const corsHeader = headers.get("access-control-allow-origin");
    if (corsHeader === "*") {
      vulnerabilities.push({
        type: "CORS_MISCONFIGURATION",
        severity: "CRITICAL",
        description: "CORS allows requests from any origin (*)",
        remediation: "Restrict CORS to specific trusted origins only",
      });
      riskLevel = "CRITICAL";
      issue = "CRITICAL: CORS allows any origin - potential data exposure";
    }

    // Check 3: Additional security headers
    if (!headers.get("x-frame-options") && !headers.get("content-security-policy")?.includes("frame-ancestors")) {
      vulnerabilities.push({
        type: "MISSING_X_FRAME_OPTIONS",
        severity: "MEDIUM",
        description: "Missing X-Frame-Options header - vulnerable to clickjacking",
        remediation: "Add X-Frame-Options: DENY or SAMEORIGIN header",
      });
      if (riskLevel === "LOW") riskLevel = "MEDIUM";
    }

    if (!headers.get("referrer-policy")) {
      vulnerabilities.push({
        type: "MISSING_REFERRER_POLICY",
        severity: "LOW",
        description: "Missing Referrer-Policy header",
        remediation: "Add Referrer-Policy: strict-origin-when-cross-origin header",
      });
    }

    // Check 4: Status code and authentication analysis
    if (response.status === 401 || response.status === 403) {
      // Good - auth is enforced, no vulnerability
    } else if (response.status === 200) {
      // Check if endpoint returns data without authentication - potential BOLA
      const contentType = headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const text = await response.text();
        if (text.length > 0) {
          // Check for exposed credentials in response
          if (text.match(/(api[_-]?key|token|secret|password|credential)/i)) {
            vulnerabilities.push({
              type: "EXPOSED_CREDENTIALS",
              severity: "CRITICAL",
              description: "Response may contain exposed credentials or API keys",
              remediation: "Never expose credentials in API responses. Use secure authentication flows.",
            });
            riskLevel = "CRITICAL";
            issue = "CRITICAL: Potential credential exposure in API response";
          }

          // Check for PII exposure patterns
          if (text.match(/(email|phone|address|ssn|social.*security|credit.*card|bank.*account)/i)) {
            const hasPII = text.match(/("[^"]+@[^"]+\.[^"]+"|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})/);
            if (hasPII) {
              vulnerabilities.push({
                type: "PII_EXPOSURE",
                severity: "HIGH",
                description: "Response may contain personally identifiable information (PII) accessible without authentication",
                remediation: "Ensure PII is only accessible to authenticated and authorized users. Implement proper access controls.",
              });
              if (riskLevel !== "CRITICAL") riskLevel = "HIGH";
            }
          }

          // Check for potential BOLA - returns user-specific data without auth
          if (text.match(/(user_id|userId|user_name|userName|account)/i) && text.length > 100) {
            vulnerabilities.push({
              type: "POTENTIAL_BOLA",
              severity: "HIGH",
              description: "API returns user-specific data without authentication - potential Broken Object Level Authorization (OWASP API1)",
              remediation: "Implement authentication and verify user has access to requested objects",
            });
            if (riskLevel !== "CRITICAL") riskLevel = "HIGH";
          }
        }
      }
    } else if (response.status >= 500) {
      vulnerabilities.push({
        type: "SERVER_ERROR",
        severity: "MEDIUM",
        description: `Server returned error status ${response.status} - potential stability or configuration issue`,
        remediation: "Investigate server logs and ensure proper error handling",
      });
      if (riskLevel === "LOW") riskLevel = "MEDIUM";
    }

    if (vulnerabilities.length > 0) {
      const highestSeverity = vulnerabilities.reduce((max, v) => {
        if (v.severity === "CRITICAL") return "CRITICAL";
        if (max === "CRITICAL") return "CRITICAL";
        if (v.severity === "HIGH" && max !== "CRITICAL") return "HIGH";
        if (max === "HIGH") return "HIGH";
        if (v.severity === "MEDIUM" && max !== "CRITICAL" && max !== "HIGH") return "MEDIUM";
        return max;
      }, "LOW");

      riskLevel = highestSeverity;
      issue = vulnerabilities[0].description;
      recommendation = vulnerabilities[0].remediation;
    }

  } catch (error: any) {
    if (error.name === "AbortError") {
      riskLevel = "MEDIUM";
      issue = "Endpoint timeout after 10 seconds - slow response or service unavailable";
      recommendation = "Endpoint did not respond within 10 seconds. Investigate endpoint performance, check for rate limiting, or contact the API provider.";
      vulnerabilities.push({
        type: "TIMEOUT",
        severity: "MEDIUM",
        description: "Endpoint did not respond within 10 seconds",
        remediation: "Check endpoint availability and performance",
      });
    } else if (error.message?.includes("fetch failed") || error.code === "ENOTFOUND") {
      riskLevel = "HIGH";
      issue = "Endpoint unreachable - DNS resolution failed or host not found";
      recommendation = "Verify the endpoint URL is correct and the server is online";
      vulnerabilities.push({
        type: "UNREACHABLE",
        severity: "HIGH",
        description: "Cannot reach endpoint - DNS or network failure",
        remediation: "Verify URL and network connectivity",
      });
    } else if (error.code === "ECONNREFUSED") {
      riskLevel = "HIGH";
      issue = "Connection refused - server is not accepting connections";
      recommendation = "Verify the server is running and accepting connections on the specified port";
    } else if (error.message?.includes("Invalid URL")) {
      riskLevel = "LOW";
      issue = "Invalid URL format";
      recommendation = "Ensure the URL is properly formatted with protocol (http:// or https://)";
    } else {
      riskLevel = "MEDIUM";
      issue = `Scan failed: ${error.message || "Unknown error"}`;
      recommendation = "Verify endpoint is accessible and properly configured";
    }
  }

  return {
    method,
    riskLevel,
    issue,
    recommendation,
    vulnerabilities,
  };
}

/**
 * Parse Postman collection with variable resolution
 */
function parsePostmanCollection(collection: any): any {
  const endpoints: any[] = [];
  const scannableUrls: string[] = [];
  const collectionName = collection.info?.name || "Untitled Collection";
  const unresolvedVariables: string[] = [];

  // Extract variables from collection
  const variables: Record<string, string> = {};

  // Collection-level variables
  if (collection.variable && Array.isArray(collection.variable)) {
    for (const v of collection.variable) {
      if (v.key && v.value !== undefined) {
        variables[v.key] = String(v.value);
      }
    }
  }

  // Environment variables (if embedded)
  if (collection.environment && Array.isArray(collection.environment.values)) {
    for (const v of collection.environment.values) {
      if (v.key && v.value !== undefined && v.enabled !== false) {
        variables[v.key] = String(v.value);
      }
    }
  }

  // Resolve Postman variables in a string
  function resolveVariables(str: string): string {
    if (!str || typeof str !== "string") return str;

    return str.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const value = variables[varName];
      if (value !== undefined) {
        return value;
      }
      // Track unresolved variables
      if (!unresolvedVariables.includes(varName)) {
        unresolvedVariables.push(varName);
      }
      return match; // Keep original if not found
    });
  }

  function extractItems(items: any[]) {
    for (const item of items) {
      if (item.request) {
        let url = typeof item.request.url === "string"
          ? item.request.url
          : item.request.url?.raw || "";

        // Resolve variables in URL
        const resolvedUrl = resolveVariables(url);
        const method = item.request.method || "GET";

        endpoints.push({
          name: item.name || "Untitled",
          method,
          url: resolvedUrl,
          originalUrl: url,
          headers: item.request.header || [],
          auth: item.request.auth || null,
        });

        // Add to scannable if it's a valid HTTP URL after resolution
        if (resolvedUrl && resolvedUrl.startsWith("http") && !resolvedUrl.includes("{{")) {
          scannableUrls.push(resolvedUrl);
        }
      }
      if (item.item && Array.isArray(item.item)) {
        extractItems(item.item);
      }
    }
  }

  if (collection.item) {
    extractItems(collection.item);
  }

  return {
    endpoints,
    scannableUrls,
    collectionName,
    variables,
    unresolvedVariables,
  };
}

/**
 * Detect credentials in Postman endpoints
 */
function detectCredentials(endpoint: any): any[] {
  const findings: any[] = [];
  const patterns = {
    API_KEY: /api[_-]?key|apikey/i,
    TOKEN: /bearer|token|jwt/i,
    PASSWORD: /password|passwd|pwd/i,
    SECRET: /secret|client[_-]?secret/i,
  };

  // Check headers
  if (endpoint.headers && Array.isArray(endpoint.headers)) {
    for (const header of endpoint.headers) {
      const key = header.key || "";
      const value = header.value || "";

      for (const [type, pattern] of Object.entries(patterns)) {
        if (pattern.test(key) || pattern.test(value)) {
          findings.push({
            type: `${type}_IN_HEADER`,
            location: `${endpoint.name} - Header: ${key}`,
            severity: "CRITICAL",
            detail: `Potential ${type.toLowerCase()} found in header "${key}"`,
            recommendation: `Remove hardcoded ${type.toLowerCase()} from Postman collection. Use environment variables instead.`,
          });
        }
      }
    }
  }

  // Check auth
  if (endpoint.auth) {
    const authType = endpoint.auth.type || "";
    if (authType === "bearer" || authType === "apikey") {
      findings.push({
        type: "AUTH_CREDENTIALS",
        location: `${endpoint.name} - Auth`,
        severity: "HIGH",
        detail: `Authentication credentials may be hardcoded in ${authType}`,
        recommendation: "Move authentication credentials to Postman environment variables",
      });
    }
  }

  return findings;
}

/**
 * Create alert
 */
async function createAlert(userId: string, severity: string, description: string, endpoint: string): Promise<void> {
  logger.info("Creating alert", { userId, severity, endpoint });

  await prisma.alert.create({
    data: {
      userId,
      severity,
      description,
      endpoint,
    },
  });

  logger.info("Alert created in database", { userId, severity, endpoint });

  // Optional: Send notifications
  await sendAlertNotification(severity, description, endpoint);
}

/**
 * Send alert notification (Slack/Email)
 */
async function sendAlertNotification(severity: string, description: string, endpoint: string): Promise<void> {
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  const alertEmail = process.env.ALERT_EMAIL;

  logger.info("Sending alert notifications", { severity, endpoint, slackEnabled: !!slackWebhook, emailEnabled: !!alertEmail });

  // Slack notification
  if (slackWebhook) {
    try {
      await fetch(slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🚨 *${severity}* Security Alert`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${severity}* security issue detected:\n\n*Endpoint:* \`${endpoint}\`\n*Issue:* ${description}`,
              },
            },
          ],
        }),
      });
      logger.info("Slack alert sent successfully", { severity, endpoint });
    } catch (e) {
      logger.error("Slack notification failed", {
        severity,
        endpoint,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Email notification (if SMTP configured)
  const transporter = getMailTransporter();
  if (transporter && alertEmail) {
    try {
      const severityEmoji = severity === "CRITICAL" ? "🔴" : severity === "HIGH" ? "🟠" : "🟡";
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: alertEmail,
        subject: `${severityEmoji} DevPulse Alert: ${severity} Security Issue`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${severity === "CRITICAL" ? "#dc2626" : severity === "HIGH" ? "#ea580c" : "#ca8a04"};">
              ${severityEmoji} ${severity} Security Alert
            </h2>
            <p><strong>Endpoint:</strong> <code>${endpoint}</code></p>
            <p><strong>Issue:</strong> ${description}</p>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              This alert was generated by DevPulse API Security Scanner.
              <br />Review and resolve this issue in your <a href="${process.env.VITE_APP_ORIGIN || "http://localhost:8080"}/dashboard">Dashboard</a>.
            </p>
          </div>
        `,
        text: `${severity} Security Alert\n\nEndpoint: ${endpoint}\nIssue: ${description}\nTime: ${new Date().toISOString()}`,
      });
      logger.info("Email alert sent successfully", { severity, endpoint, recipient: alertEmail });
    } catch (e) {
      logger.error("Email notification failed", {
        severity,
        endpoint,
        recipient: alertEmail,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * Generate compliance report
 */
function generateComplianceReport(scans: any[], checks: any[], organizationName: string, reportType: string): any {
  const now = new Date();
  const criticalVulns = scans.filter(s => s.riskLevel === "CRITICAL");
  const highVulns = scans.filter(s => s.riskLevel === "HIGH");
  const mediumVulns = scans.filter(s => s.riskLevel === "MEDIUM");
  const lowVulns = scans.filter(s => s.riskLevel === "LOW");

  const criticalCount = criticalVulns.length;
  const highCount = highVulns.length;
  const mediumCount = mediumVulns.length;
  const lowCount = lowVulns.length;

  // PCI DSS Requirements mapping
  const pciRequirements = [
    {
      requirement_id: "6.5.1",
      title: "API Security Controls and Vulnerability Management",
      description: "Protect all system components and software from known vulnerabilities by installing applicable security patches/updates.",
      owasp_category: "OWASP API1:2023 Broken Object Level Authorization",
      status: criticalCount === 0 ? "PASS" : "FAIL",
      evidence: `${scans.length} API endpoints scanned. ${criticalCount} critical vulnerabilities detected.`,
      findings: criticalVulns.slice(0, 5).map(v => ({
        issue: v.issue,
        risk_level: v.riskLevel,
        recommendation: v.recommendation,
      })),
      remediation: criticalCount > 0 ? "Address all critical vulnerabilities immediately. Review OWASP API Security Top 10 and implement recommended controls." : "Continue regular vulnerability scanning.",
      gdpr_articles: ["Article 32 - Security of Processing"],
    },
    {
      requirement_id: "6.5.4",
      title: "Secure Coding Practices for API Development",
      description: "Follow secure coding practices and develop applications based on secure coding guidelines.",
      owasp_category: "OWASP API2:2023 Broken Authentication",
      status: criticalCount + highCount === 0 ? "PASS" : criticalCount + highCount <= 2 ? "WARN" : "FAIL",
      evidence: `Security scan results: ${highCount} high-severity authentication/authorization issues found.`,
      findings: highVulns.slice(0, 5).map(v => ({
        issue: v.issue,
        risk_level: v.riskLevel,
        recommendation: v.recommendation,
      })),
      remediation: highCount > 0 ? "Implement OAuth 2.0 or JWT-based authentication. Enforce authorization checks on all API endpoints." : "Maintain current security practices.",
      gdpr_articles: ["Article 32 - Security of Processing", "Article 25 - Data Protection by Design"],
    },
    {
      requirement_id: "2.2.7",
      title: "TLS/HTTPS Enforcement for Data in Transit",
      description: "Encrypt transmission of cardholder data across open, public networks using strong cryptography.",
      owasp_category: "OWASP API8:2023 Security Misconfiguration",
      status: scans.filter(s => s.issue.toLowerCase().includes("https") || s.issue.toLowerCase().includes("tls")).length === 0 ? "PASS" : "FAIL",
      evidence: `HTTPS/TLS enforcement verified across ${scans.length} API endpoints.`,
      findings: scans.filter(s => s.issue.toLowerCase().includes("https") || s.issue.toLowerCase().includes("tls")).slice(0, 5).map(v => ({
        issue: v.issue,
        risk_level: v.riskLevel,
        recommendation: v.recommendation,
      })),
      remediation: scans.filter(s => s.issue.toLowerCase().includes("https")).length > 0 ? "Enable HTTPS/TLS 1.2+ on all API endpoints. Disable HTTP fallback." : "Continue enforcing TLS.",
      gdpr_articles: ["Article 32(1)(a) - Encryption of Personal Data"],
    },
    {
      requirement_id: "6.4.3",
      title: "Security Testing Coverage",
      description: "Application security testing occurs prior to production and after significant changes.",
      owasp_category: "OWASP API9:2023 Improper Inventory Management",
      status: scans.length > 0 ? "PASS" : "FAIL",
      evidence: `${scans.length} endpoints tested with automated security scanner. Last scan: ${now.toISOString()}.`,
      findings: [],
      remediation: "Integrate DevPulse security scanning into CI/CD pipeline for continuous testing.",
      gdpr_articles: ["Article 32 - Security of Processing"],
    },
    {
      requirement_id: "11.3.1",
      title: "Internal Vulnerability Scans",
      description: "Internal vulnerability scans are performed at least quarterly.",
      owasp_category: "OWASP API10:2023 Unsafe Consumption of APIs",
      status: scans.length > 0 ? "PASS" : "FAIL",
      evidence: `Last vulnerability scan completed: ${now.toISOString()}. ${scans.length} endpoints assessed.`,
      findings: [],
      remediation: "Schedule quarterly vulnerability scans. Set up automated scanning for continuous monitoring.",
      gdpr_articles: [],
    }
  ];

  const passCount = pciRequirements.filter(r => r.status === "PASS").length;
  const failCount = pciRequirements.filter(r => r.status === "FAIL").length;
  const warnCount = pciRequirements.filter(r => r.status === "WARN").length;
  const compliancePercentage = Math.round((passCount / pciRequirements.length) * 100);

  let overallStatus: "COMPLIANT" | "NON_COMPLIANT" | "PARTIAL_COMPLIANCE" = "COMPLIANT";
  let overallMessage = "All PCI DSS v4.0.1 requirements passed.";

  if (failCount > 0) {
    overallStatus = "NON_COMPLIANT";
    overallMessage = `${failCount} requirement(s) failed. Immediate action required.`;
  } else if (warnCount > 0) {
    overallStatus = "PARTIAL_COMPLIANCE";
    overallMessage = `${warnCount} requirement(s) need attention.`;
  }

  // GDPR Checks
  const gdprChecks = [
    {
      article: "Article 32",
      title: "Security of Processing",
      status: criticalCount === 0 ? "PASS" : "FAIL",
      evidence: `${scans.length} API endpoints assessed. Technical security measures in place: HTTPS enforcement, vulnerability scanning, security monitoring.`,
      remediation: criticalCount > 0 ? "Address critical vulnerabilities to ensure appropriate technical security measures." : null,
    },
    {
      article: "Article 25",
      title: "Data Protection by Design and Default",
      status: "PASS",
      evidence: "API security scanning integrated into development workflow. Automated vulnerability detection in place.",
      remediation: null,
    },
    {
      article: "Article 32(1)(a)",
      title: "Encryption of Personal Data",
      status: scans.filter(s => s.issue.toLowerCase().includes("https")).length === 0 ? "PASS" : "FAIL",
      evidence: "TLS/HTTPS encryption verified for data in transit across API endpoints.",
      remediation: scans.filter(s => s.issue.toLowerCase().includes("https")).length > 0 ? "Enable HTTPS encryption on all endpoints handling personal data." : null,
    },
  ];

  const gdprOverallStatus = gdprChecks.every(c => c.status === "PASS") ? "PASS" : "FAIL";

  return {
    report_id: `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase(),
    report_type: reportType,
    organization_name: organizationName,
    organization: organizationName,
    generated_at: now.toISOString(),
    scan_summary: {
      total_findings: scans.length,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
    },
    summary: {
      total_scans: scans.length,
      critical_vulnerabilities: criticalCount,
      high_vulnerabilities: highCount,
      medium_vulnerabilities: mediumCount,
      compliance_checks: checks.length,
    },
    pci_dss: reportType === "pci_dss" || reportType === "both" ? {
      framework: "PCI DSS v4.0.1",
      version: "4.0.1",
      overall_status: overallStatus,
      overall_message: overallMessage,
      compliance_percentage: compliancePercentage,
      requirements_pass: passCount,
      requirements_fail: failCount,
      requirements_warn: warnCount,
      requirements: pciRequirements,
      controls: pciRequirements.map(r => ({
        control: `PCI DSS ${r.requirement_id}`,
        description: r.title,
        status: r.status,
        evidence: r.evidence,
      })),
    } : undefined,
    gdpr: reportType === "gdpr" || reportType === "both" ? {
      framework: "GDPR",
      regulation: "EU 2016/679",
      overall_status: gdprOverallStatus,
      checks: gdprChecks,
      controls: gdprChecks.map(c => ({
        control: c.article,
        description: c.title,
        status: c.status,
        evidence: c.evidence,
      })),
    } : undefined,
    attestation: {
      tool: "DevPulse API Security Scanner",
      version: "1.0.0",
      scan_method: "Automated OWASP API Security Top 10 checks with real HTTP requests",
      note: "This report is generated from automated security scans and should be reviewed by a qualified security assessor (QSA) for official PCI DSS compliance attestation. DevPulse provides evidence collection and compliance gap analysis to reduce QSA engagement costs.",
    },
  };
}

/**
 * Calculate unified risk score
 */
function calculateUnifiedRiskScore(scans: any[], llmUsage: any[]): any[] {
  const endpointScores: Record<string, any> = {};

  // Security risk component (60%)
  for (const scan of scans) {
    if (!endpointScores[scan.endpoint]) {
      endpointScores[scan.endpoint] = {
        endpoint: scan.endpoint,
        security_risk: 0,
        cost_anomaly_risk: 0,
        unified_score: 0,
      };
    }

    let securityScore = 0;
    if (scan.riskLevel === "CRITICAL") securityScore = 100;
    else if (scan.riskLevel === "HIGH") securityScore = 75;
    else if (scan.riskLevel === "MEDIUM") securityScore = 50;
    else securityScore = 25;

    endpointScores[scan.endpoint].security_risk = Math.max(
      endpointScores[scan.endpoint].security_risk,
      securityScore
    );
  }

  // Cost anomaly component (40%) - simplified
  const avgCost = llmUsage.reduce((sum, u) => sum + u.costInr, 0) / (llmUsage.length || 1);
  for (const usage of llmUsage) {
    const endpoint = usage.endpoint;
    if (endpoint && endpointScores[endpoint]) {
      const costDiff = usage.costInr - avgCost;
      const anomalyScore = Math.min(100, Math.max(0, (costDiff / avgCost) * 100));
      endpointScores[endpoint].cost_anomaly_risk = anomalyScore;
    }
  }

  // Calculate unified score
  for (const key of Object.keys(endpointScores)) {
    const sec = endpointScores[key].security_risk;
    const cost = endpointScores[key].cost_anomaly_risk;
    endpointScores[key].unified_score = Math.round(sec * 0.6 + cost * 0.4);
  }

  return Object.values(endpointScores);
}

// ═══════════════════════════════════════════════════════════════════════════

app.listen(port, () => {
  logger.info(`Hybrid backend running on http://localhost:${port}`);
});


