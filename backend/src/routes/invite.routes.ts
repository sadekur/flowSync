import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireCsrf } from "../middleware/csrf";
import * as inviteController from "../controllers/invite.controller";

export const inviteRouter = Router();

// POST, not GET, so the token travels in the body and stays out of URLs and
// logs. No session needed (the person may not have an account yet) and no
// CSRF: it only reads, and the token is the credential.
inviteRouter.post("/invites/lookup", asyncHandler(inviteController.lookup));
// Joining a workspace is a session write, so it gets the usual auth + CSRF.
inviteRouter.post("/invites/accept", requireAuth, requireCsrf, asyncHandler(inviteController.accept));
