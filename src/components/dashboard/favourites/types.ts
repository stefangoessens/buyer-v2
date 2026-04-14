import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";

export type FavouriteRow = FunctionReturnType<
  typeof api.buyerFavourites.listFavourites
>[number];
