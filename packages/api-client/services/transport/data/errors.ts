import { ApiError, errorBody } from "../../contracts";
import { classify } from "../logic/policy";
export function responseError(status: number, body: unknown): ApiError {
  const parsed = errorBody.safeParse(body);
  const fields = parsed.success ? (parsed.data.validation_error ?? {}) : {};
  const message =
    Object.values(fields).flat().join("\n") ||
    (parsed.success ? parsed.data.message : null) ||
    "The request could not complete.";
  return new ApiError(message, status, classify(status), fields);
}
