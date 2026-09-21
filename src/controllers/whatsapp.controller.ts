import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { sendTemplateSchema } from "../validators/whatsapp.validator";
import { sendTemplate, WhatsappServiceError } from "../services/whatsapp/whatsapp.service";
import { listTemplates, syncTemplates } from "../services/whatsapp/templates.service";
import { createTemplate, createTemplateSchema } from "../services/whatsapp/templates.service";
import { sendError, sendSuccess } from "../utils/response";

export async function sendTemplateHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth;
  if (!auth) {
    sendError(res, "UNAUTHORIZED", "Authentication required", 401);
    return;
  }

  const parsed = sendTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, "VALIDATION_ERROR", "Invalid request body", 400, parsed.error.flatten());
    return;
  }

  try {
    const result = await sendTemplate(auth.tenantId, parsed.data);
    sendSuccess(res, result, 201);
  } catch (err) {
    if (err instanceof WhatsappServiceError) {
      sendError(res, err.code, err.message, err.status);
      return;
    }
    sendError(res, "WHATSAPP_SEND_FAILED", "Unable to send WhatsApp message", 502);
  }
}

const syncTemplatesSchema = z.object({
  whatsappAccountId: z.string().min(1).max(64).optional(),
});

export async function syncTemplatesHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    sendError(res, "UNAUTHORIZED", "Authentication required", 401);
    return;
  }
  const parsed = syncTemplatesSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendError(res, "VALIDATION_ERROR", "Invalid request body", 400, parsed.error.flatten());
    return;
  }
  try {
    sendSuccess(res, await syncTemplates(req.auth.tenantId, parsed.data.whatsappAccountId));
  } catch (err) {
    if (err instanceof WhatsappServiceError) sendError(res, err.code, err.message, err.status);
    else sendError(res, "TEMPLATE_SYNC_FAILED", "Unable to sync templates", 502);
  }
}

export async function listTemplatesHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    sendError(res, "UNAUTHORIZED", "Authentication required", 401);
    return;
  }
  sendSuccess(res, await listTemplates(req.auth.tenantId));
}

/** GET /api/v1/whatsapp/accounts — tenant's numbers. Never includes tokens. */
export async function listAccountsHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    sendError(res, "UNAUTHORIZED", "Authentication required", 401);
    return;
  }
  sendSuccess(
    res,
    await prisma.whatsappAccount.findMany({
      where: { tenantId: req.auth.tenantId },
      select: {
        id: true,
        businessName: true,
        displayPhoneNumber: true,
        wabaId: true,
        phoneNumberId: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  );
}

export async function createTemplateHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    sendError(res, "UNAUTHORIZED", "Authentication required", 401);
    return;
  }
  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, "VALIDATION_ERROR", "Invalid request body", 400, parsed.error.flatten());
    return;
  }
  try {
    sendSuccess(res, await createTemplate(req.auth.tenantId, parsed.data), 201);
  } catch (err) {
    if (err instanceof WhatsappServiceError) sendError(res, err.code, err.message, err.status);
    else sendError(res, "TEMPLATE_CREATE_FAILED", "Unable to create template", 502);
  }
}
