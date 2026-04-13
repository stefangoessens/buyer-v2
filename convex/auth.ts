import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import type { DataModel } from "./_generated/dataModel";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile(params) {
        const email = params.email;
        if (typeof email !== "string" || email.length === 0) {
          throw new Error("Email is required");
        }
        const name =
          typeof params.name === "string" && params.name.length > 0
            ? params.name
            : email.split("@")[0];
        const rawRole = params.role;
        const role =
          rawRole === "buyer" || rawRole === "broker" || rawRole === "admin"
            ? rawRole
            : "buyer";
        const phone =
          typeof params.phone === "string" && params.phone.length > 0
            ? params.phone
            : undefined;
        return {
          email,
          name,
          role,
          phone,
        };
      },
    }),
  ],
});
