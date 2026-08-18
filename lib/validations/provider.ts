import { z } from "zod";

export const providerInputSchema = z.object({
  name: z.string().trim().min(2, "请输入 Provider 名称"),
  baseUrl: z.string().trim().url("请输入有效的 baseURL"),
  apiKey: z.string().trim().optional().default(""),
  imageBaseUrl: z
    .union([z.string().trim().url("请输入有效的图像接口 baseURL"), z.literal("")])
    .optional()
    .default(""),
  imageApiKey: z.string().trim().optional().default(""),
});

const modelSnapshotSchema = z
  .object({
    modelId: z.string().min(1),
    label: z.string().min(1),
    capabilities: z.record(z.string(), z.unknown()),
    roles: z.record(z.string(), z.unknown()),
    quality: z.string().nullable().optional(),
    latency: z.string().nullable().optional(),
    cost: z.string().nullable().optional(),
    isAvailable: z.boolean().default(true),
    endpointSupport: z
      .object({
        imageGeneration: z.string(),
        imageEdit: z.string(),
        note: z.string().nullable().optional(),
      })
      .optional(),
  })
  .passthrough();

export const providerSaveSchema = providerInputSchema.extend({
  id: z.string().optional(),
  isActive: z.boolean().default(true),
  discoveredModels: z.array(modelSnapshotSchema).optional(),
  defaultAssignments: z
    .object({
      analysisModelId: z.string().optional().nullable(),
      planningModelId: z.string().optional().nullable(),
      heroImageModelId: z.string().optional().nullable(),
      detailImageModelId: z.string().optional().nullable(),
      imageEditModelId: z.string().optional().nullable(),
    })
    .optional(),
});
