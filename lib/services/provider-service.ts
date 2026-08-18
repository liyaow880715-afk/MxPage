import { prisma } from "@/lib/db/prisma";
import { OpenAICompatibleAdapter } from "@/lib/ai/adapters/openai-compatible";
import { RoutedProviderAdapter, type ProviderAdapter } from "@/lib/ai/provider-client";
import { normalizeDetectedModels } from "@/lib/ai/capability-detector";
import { recommendDefaultModels } from "@/lib/ai/model-matcher";
import { encryptSecret } from "@/lib/utils/crypto";
import {
  getRequestProviderCredentials,
  resolveEffectiveBaseUrl,
  resolveEffectiveImageBaseUrl,
} from "@/lib/services/provider-runtime";
import type {
  CapabilityMap,
  ModelDetectionResult,
  ModelRoleMap,
  ProviderConnectionInput,
} from "@/types/domain";

type RuntimeProviderModel = {
  id: string;
  providerConfigId: string;
  modelId: string;
  label: string;
  capabilities: Record<string, unknown>;
  roles: Record<string, unknown>;
  quality: string | null;
  latency: string | null;
  cost: string | null;
  isAvailable: boolean;
  isDefaultAnalysis: boolean;
  isDefaultPlanning: boolean;
  isDefaultHeroImage: boolean;
  isDefaultDetailImage: boolean;
  isDefaultImageEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
  endpointSupport: {
    imageGeneration: string;
    imageEdit: string;
    note: string | null;
  };
  endpointSource?: "text" | "image" | "both";
};

type ProviderAdapterContext = {
  provider: {
    id: string;
    name: string;
    baseUrl: string;
    imageBaseUrl: string;
    apiKeyEncrypted: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    models: RuntimeProviderModel[];
  };
  apiKey: string;
  imageApiKey: string;
  adapter: ProviderAdapter;
};

type ProviderModelSnapshot = {
  modelId: string;
  label: string;
  capabilities: Record<string, unknown>;
  roles: Record<string, unknown>;
  quality?: string | null;
  latency?: string | null;
  cost?: string | null;
  isAvailable: boolean;
  endpointSupport?: {
    imageGeneration: string;
    imageEdit: string;
    note?: string | null;
  };
  endpointSource?: "text" | "image" | "both";
};

function readEndpointSupport(capabilities: Record<string, unknown> | null | undefined) {
  return {
    imageGeneration: (capabilities?.__imageGenerationStatus as string | undefined) ?? "unknown",
    imageEdit: (capabilities?.__imageEditStatus as string | undefined) ?? "unknown",
    note: (capabilities?.__probeNote as string | undefined) ?? null,
  };
}

function readEndpointSource(capabilities: Record<string, unknown> | null | undefined) {
  const source = capabilities?.__endpointSource;
  return source === "text" || source === "image" || source === "both" ? source : undefined;
}

function hydrateProviderModels<T extends { capabilities: any }>(models: T[]) {
  return models.map((model) => ({
    ...model,
    endpointSupport: readEndpointSupport(model.capabilities as Record<string, unknown> | undefined),
    endpointSource: readEndpointSource(model.capabilities as Record<string, unknown> | undefined),
  }));
}

const PASSIVE_IMAGE_CAPABILITY_NOTE =
  "Passive capability detection only; no real image endpoint probe is called during model discovery.";

function enrichModelEndpointSupport(models: ProviderModelSnapshot[]) {
  return models.map((model) => {
    const capabilities = { ...(model.capabilities as Record<string, unknown>) };
    delete capabilities.real_image_gen;
    delete capabilities.real_image_edit;

    const hasImageGeneration = Boolean(capabilities.image_gen);
    const hasImageEdit = Boolean(capabilities.image_edit);
    const endpointSupport = {
      imageGeneration: hasImageGeneration ? ("unknown" as const) : ("not_applicable" as const),
      imageEdit: hasImageEdit ? ("unknown" as const) : ("not_applicable" as const),
      note: hasImageGeneration || hasImageEdit ? PASSIVE_IMAGE_CAPABILITY_NOTE : null,
    };

    capabilities.__imageGenerationStatus = endpointSupport.imageGeneration;
    capabilities.__imageEditStatus = endpointSupport.imageEdit;
    capabilities.__probeNote = endpointSupport.note;

    return {
      ...model,
      capabilities: capabilities as CapabilityMap,
      roles: { ...model.roles } as ModelRoleMap,
      endpointSupport,
    };
  }) satisfies ModelDetectionResult[];
}

async function replaceProviderModels(
  providerConfigId: string,
  models: Awaited<ReturnType<typeof discoverProviderModels>>["models"],
  defaults: {
    analysisModelId?: string | null;
    planningModelId?: string | null;
    heroImageModelId?: string | null;
    detailImageModelId?: string | null;
    imageEditModelId?: string | null;
  },
) {
  await prisma.modelProfile.deleteMany({
    where: { providerConfigId },
  });

  await prisma.modelProfile.createMany({
    data: models.map((model) => ({
      providerConfigId,
      modelId: model.modelId,
      label: model.label,
      capabilities: model.capabilities,
      roles: model.roles,
      quality: model.quality,
      latency: model.latency,
      cost: model.cost,
      isAvailable: model.isAvailable,
      isDefaultAnalysis: defaults.analysisModelId === model.modelId,
      isDefaultPlanning: defaults.planningModelId === model.modelId,
      isDefaultHeroImage: defaults.heroImageModelId === model.modelId,
      isDefaultDetailImage: defaults.detailImageModelId === model.modelId,
      isDefaultImageEdit: defaults.imageEditModelId === model.modelId,
    })),
  });
}

export async function testProviderConnection(input: ProviderConnectionInput) {
  const textBaseUrl = resolveEffectiveBaseUrl(input.baseUrl);
  const imageBaseUrl = resolveEffectiveImageBaseUrl(input.imageBaseUrl || textBaseUrl);
  const textAdapter = new OpenAICompatibleAdapter(textBaseUrl, input.apiKey);
  const imageAdapter = new OpenAICompatibleAdapter(imageBaseUrl, input.imageApiKey || input.apiKey);
  const textResult = await textAdapter.testConnection();
  if (imageBaseUrl !== textBaseUrl || (input.imageApiKey || input.apiKey) !== input.apiKey) {
    await imageAdapter.testConnection();
  }
  return textResult;
}

export async function resolveProviderConnectionInput(
  input: Omit<ProviderConnectionInput, "apiKey"> & { apiKey?: string | null; id?: string | null },
): Promise<ProviderConnectionInput> {
  const runtimeCredentials = getRequestProviderCredentials();
  const apiKey = input.apiKey?.trim() || runtimeCredentials.apiKey?.trim() || "";
  const baseUrl = resolveEffectiveBaseUrl(input.baseUrl || runtimeCredentials.baseUrl);
  const imageApiKey = input.imageApiKey?.trim() || runtimeCredentials.imageApiKey?.trim() || apiKey;
  const imageBaseUrl = resolveEffectiveImageBaseUrl(input.imageBaseUrl || runtimeCredentials.imageBaseUrl || baseUrl);

  if (!apiKey) {
    throw new Error("API Key is not configured in this browser. Configure it in Provider settings first.");
  }

  if (!baseUrl) {
    throw new Error("Provider text/vision baseURL is not configured. Set it in the UI or LOCK_BASE_URL.");
  }

  return {
    name: input.name,
    baseUrl,
    apiKey,
    imageBaseUrl,
    imageApiKey,
  };
}

export async function discoverProviderModels(input: ProviderConnectionInput) {
  const baseUrl = resolveEffectiveBaseUrl(input.baseUrl);
  const imageBaseUrl = resolveEffectiveImageBaseUrl(input.imageBaseUrl || baseUrl);
  const textAdapter = new OpenAICompatibleAdapter(baseUrl, input.apiKey);
  const imageAdapter = new OpenAICompatibleAdapter(imageBaseUrl, input.imageApiKey || input.apiKey);
  const textModels = await textAdapter.listModels();
  let imageModels: Awaited<ReturnType<typeof imageAdapter.listModels>> = [];
  let imageError: string | null = null;
  try {
    imageModels = await imageAdapter.listModels();
  } catch (error) {
    if (imageBaseUrl === baseUrl && (input.imageApiKey || input.apiKey) === input.apiKey) {
      throw error;
    }
    imageError = error instanceof Error ? error.message : "图像生成 / 编辑接口模型探测失败";
  }

  const sourceByModelId = new Map<string, "text" | "image" | "both">();
  for (const model of textModels) sourceByModelId.set(model.id.trim().toLowerCase(), "text");
  for (const model of imageModels) {
    const key = model.id.trim().toLowerCase();
    sourceByModelId.set(key, sourceByModelId.get(key) === "text" ? "both" : "image");
  }
  const seen = new Set<string>();
  const models = [...textModels, ...imageModels].filter((model) => {
    const key = model.id.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const normalized = enrichModelEndpointSupport(
    normalizeDetectedModels(models).map((model) => ({
      ...model,
      endpointSource: sourceByModelId.get(model.modelId) ?? "text",
      capabilities: {
        ...model.capabilities,
        ...(sourceByModelId.get(model.modelId) === "image" || sourceByModelId.get(model.modelId) === "both"
          ? { image_gen: true, image_edit: true, high_quality: true }
          : {}),
        __endpointSource: sourceByModelId.get(model.modelId) ?? "text",
      },
      roles: {
        ...model.roles,
        ...(sourceByModelId.get(model.modelId) === "image" || sourceByModelId.get(model.modelId) === "both"
          ? { hero_image: true, detail_image: true, image_edit: true }
          : {}),
      },
    })),
  );
  return {
    models: normalized,
    recommendations: recommendDefaultModels(normalized),
    textModels,
    imageModels,
    imageError,
  };
}

export async function saveProviderConfig(
  input: ProviderConnectionInput & {
    id?: string | null;
    isActive?: boolean;
    discoveredModels?: ProviderModelSnapshot[];
    defaultAssignments?: {
      analysisModelId?: string | null;
      planningModelId?: string | null;
      heroImageModelId?: string | null;
      detailImageModelId?: string | null;
      imageEditModelId?: string | null;
    };
  },
) {
  const baseUrl = resolveEffectiveBaseUrl(input.baseUrl);
  const imageBaseUrl = resolveEffectiveImageBaseUrl(input.imageBaseUrl || baseUrl);
  const discoveredModels = Array.isArray(input.discoveredModels)
    ? enrichModelEndpointSupport(input.discoveredModels)
    : (await discoverProviderModels({ ...input, baseUrl, imageBaseUrl })).models;
  const discovered = {
    models: discoveredModels,
    recommendations: recommendDefaultModels(discoveredModels),
  };
  const nextIsActive = input.isActive ?? true;

  if (nextIsActive) {
    await prisma.providerConfig.updateMany({
      data: { isActive: false },
    });
  }

  const provider = input.id
    ? await prisma.providerConfig.update({
        where: { id: input.id },
        data: {
          name: input.name,
          baseUrl,
          imageBaseUrl,
          apiKeyEncrypted: encryptSecret(""),
          isActive: nextIsActive,
        },
      })
    : await prisma.providerConfig.create({
        data: {
          name: input.name,
          baseUrl,
          imageBaseUrl,
          apiKeyEncrypted: encryptSecret(""),
          isActive: nextIsActive,
        },
      });

  const defaults = {
    ...discovered.recommendations,
    ...(input.defaultAssignments ?? {}),
  };

  await replaceProviderModels(provider.id, discovered.models, defaults);
  return provider.id;
}

export async function getAllProviderConfigs() {
  const providers = await prisma.providerConfig.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      models: {
        orderBy: { modelId: "asc" },
      },
    },
  });

  return providers.map((provider) => {
    const effectiveBaseUrl = resolveEffectiveBaseUrl(provider.baseUrl);
    const effectiveImageBaseUrl = resolveEffectiveImageBaseUrl(provider.imageBaseUrl || effectiveBaseUrl);
    return {
      ...provider,
      baseUrl: effectiveBaseUrl,
      imageBaseUrl: effectiveImageBaseUrl,
      apiKey: "",
      maskedApiKey: "",
      models: hydrateProviderModels(provider.models),
    };
  });
}

export async function getActiveProviderConfig() {
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true },
    include: {
      models: {
        orderBy: { modelId: "asc" },
      },
    },
  });

  if (!provider) return null;

  const effectiveBaseUrl = resolveEffectiveBaseUrl(provider.baseUrl);
  const effectiveImageBaseUrl = resolveEffectiveImageBaseUrl(provider.imageBaseUrl || effectiveBaseUrl);
  return {
    ...provider,
    baseUrl: effectiveBaseUrl,
    imageBaseUrl: effectiveImageBaseUrl,
    apiKey: "",
    maskedApiKey: "",
    models: hydrateProviderModels(provider.models),
  };
}

export async function activateProviderConfig(providerId: string) {
  const provider = await prisma.providerConfig.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    throw new Error("未找到要切换的历史服务配置。");
  }

  await prisma.$transaction([
    prisma.providerConfig.updateMany({
      data: { isActive: false },
    }),
    prisma.providerConfig.update({
      where: { id: providerId },
      data: { isActive: true },
    }),
  ]);

  return getAllProviderConfigs();
}

export async function getProviderAdapter(providerId?: string): Promise<ProviderAdapterContext> {
  const provider =
    (providerId
      ? await prisma.providerConfig.findUnique({
          where: { id: providerId },
          include: { models: true },
        })
      : await prisma.providerConfig.findFirst({
          where: { isActive: true },
          include: { models: true },
        })) ?? null;

  if (!provider) {
    throw new Error("No active provider config found.");
  }

  const runtimeCredentials = getRequestProviderCredentials();
  const apiKey = runtimeCredentials.apiKey?.trim() ?? "";
  if (!apiKey) {
    throw new Error("API Key is not configured in this browser. Configure it in Provider settings first.");
  }
  const baseUrl = resolveEffectiveBaseUrl(runtimeCredentials.baseUrl ?? provider.baseUrl);
  const imageBaseUrl = resolveEffectiveImageBaseUrl(runtimeCredentials.imageBaseUrl ?? provider.imageBaseUrl ?? baseUrl);
  const imageApiKey = runtimeCredentials.imageApiKey?.trim() || apiKey;
  const runtimeModels = hydrateProviderModels(provider.models) as unknown as RuntimeProviderModel[];
  const textAdapter = new OpenAICompatibleAdapter(baseUrl, apiKey);
  const imageAdapter = new OpenAICompatibleAdapter(imageBaseUrl, imageApiKey);

  return {
    provider: {
      ...provider,
      baseUrl,
      imageBaseUrl,
      models: runtimeModels,
    },
    apiKey,
    imageApiKey,
    adapter: new RoutedProviderAdapter(textAdapter, imageAdapter),
  };
}
