"use server";
// Example only: used by the Appearance control in Settings (System, Light, Dark).
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function setTheme(value: "system" | "light" | "dark") {
  const jar = await cookies();
  if (value === "system") jar.delete("op-theme");
  else jar.set("op-theme", value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
