import { action as cartAddAction, loader as cartAddLoader } from "./api.cart-add";

export const loader = async (args) => {
  console.log("[backend.api.cart-add] loader hit", {
    method: args.request.method,
    url: args.request.url,
  });
  return cartAddLoader(args);
};

export const action = async (args) => {
  console.log("[backend.api.cart-add] action hit", {
    method: args.request.method,
    url: args.request.url,
  });
  return cartAddAction(args);
};
