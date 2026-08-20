import { z } from "zod";
import { NextRequest } from "next/server";

import {
  activateProviderConfig,
  getAllProviderConfigs,
  resolveProviderConnectionInput,
  saveProviderConfig,
} from "@/lib/services/provider-service";
import {
  getLockedBaseUrl,
  getLockedImageBaseUrl,
  isImageBaseUrlLocked,
  isBaseUrlLocked,
  withProviderCredentials,
} from "@/lib/services/provider-runtime";
import { providerSaveSchema } from "@/lib/validations/provider";
import { handleRouteError, ok } from "@/lib/utils/route";

const providerActivateSchema = z.object({
  providerId: z.string().min(1, "请选择要切换的历史服务"),
});

function providerRuntimeConfig() {
  return {
    baseUrlLocked: isBaseUrlLocked(),
    lockedBaseUrl: getLockedBaseUrl() || null,
    imageBaseUrlLocked: isImageBaseUrlLocked(),
    lockedImageBaseUrl: getLockedImageBaseUrl() || null,
  };
}

export async function GET() {
  try {
    const providers = await getAllProviderConfigs();
    return ok({ providers, runtime: providerRuntimeConfig() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  return withProviderCredentials(request, async () => {
    try {
      const parsed = providerSaveSchema.parse(await request.json());
      const resolved = await resolveProviderConnectionInput(parsed);
      const savedProviderId = await saveProviderConfig({
        ...parsed,
        baseUrl: resolved.baseUrl,
        apiKey: resolved.apiKey,
        imageBaseUrl: resolved.imageBaseUrl,
        imageApiKey: resolved.imageApiKey,
        temperature: resolved.temperature,
        reasoningEffort: resolved.reasoningEffort,
      });
      const providers = await getAllProviderConfigs();
      return ok({
        savedProviderId,
        providers,
        runtime: providerRuntimeConfig(),
      });
    } catch (error) {
      return handleRouteError(error);
    }
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = providerActivateSchema.parse(await request.json());
    const providers = await activateProviderConfig(parsed.providerId);
    return ok({ providers, runtime: providerRuntimeConfig() });
  } catch (error) {
    return handleRouteError(error);
  }
}
