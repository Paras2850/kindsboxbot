import { SignJWT, jwtVerify } from "jose";

function getSecret(): Uint8Array {
  const secretKey = process.env.JWT_SECRET || "insecure-dev-secret-change-me";
  return new TextEncoder().encode(secretKey);
}

export const ADMIN_SESSION_COOKIE = "admin_session";

export interface AdminSessionPayload {
  adminId: number;
  username: string;
  role: string;
}

export async function signAdminSession(payload: AdminSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
}

export async function verifyAdminSession(token: string): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.adminId === "number" &&
      typeof payload.username === "string" &&
      typeof payload.role === "string"
    ) {
      return { adminId: payload.adminId, username: payload.username, role: payload.role };
    }
    return null;
  } catch {
    return null;
  }
}
