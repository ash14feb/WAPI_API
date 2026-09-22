import { Router } from "express";
import {
  cancelCampaignHandler,
  createCampaignHandler,
  getCampaignHandler,
  listCampaignsHandler,
  sendCampaignHandler,
  tickScheduledCampaignsHandler,
} from "../controllers/campaigns.controller";
import { authenticate } from "../middleware/auth";

export const campaignsRouter = Router();

campaignsRouter.get("/campaigns", authenticate, listCampaignsHandler);
campaignsRouter.post("/campaigns", authenticate, createCampaignHandler);
campaignsRouter.get("/campaigns/:id", authenticate, getCampaignHandler);
campaignsRouter.post("/campaigns/:id/send", authenticate, sendCampaignHandler);
campaignsRouter.post("/campaigns/:id/cancel", authenticate, cancelCampaignHandler);
// Vercel Cron only sends GET — support both GET (cron) and POST (manual).
campaignsRouter.get("/campaigns/tick", tickScheduledCampaignsHandler);
campaignsRouter.post("/campaigns/tick", tickScheduledCampaignsHandler);
