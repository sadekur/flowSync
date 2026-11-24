import { z } from "zod";
import { emailedTokenSchema } from "./auth.validators";

export const inviteTokenSchema = z.object({
  token: emailedTokenSchema,
});
