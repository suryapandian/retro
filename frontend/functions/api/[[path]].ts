import { forwardApi, type ForwardEnv } from "../../server/forward";

export const onRequest = (context: { request: Request; env: ForwardEnv }) => forwardApi(context.request, context.env);
