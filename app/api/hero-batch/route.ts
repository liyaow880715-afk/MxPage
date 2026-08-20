import { NextRequest } from "next/server";
import { z } from "zod";

import { getProviderAdapter } from "@/lib/services/provider-service";
import { withProviderCredentials } from "@/lib/services/provider-runtime";
import { handleRouteError, ok } from "@/lib/utils/route";

const MAX_DATA_URL_CHARS = 1_200_000;
const requestSchema = z.object({
  productImages: z.array(
    z.string()
      .max(MAX_DATA_URL_CHARS)
      .refine((value) => /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(value), "仅支持 JPG、PNG 或 WebP 图片"),
  ).min(1).max(6),
  productPrompt: z.string().trim().max(4000).default(""),
  styles: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  aspectRatio: z.enum(["1:1", "3:4", "9:16"]).default("1:1"),
});

function imageResultToDataUrl(result: { b64Json?: string | null; url?: string | null }) {
  if (result.b64Json) return "data:image/png;base64," + result.b64Json;
  return result.url ?? null;
}

function chooseImageModel(provider: Awaited<ReturnType<typeof getProviderAdapter>>["provider"]) {
  return (
    provider.models.find((item) => item.isDefaultHeroImage && Boolean((item.capabilities as Record<string, unknown>)?.image_gen))?.modelId ??
    provider.models.find((item) => item.isDefaultDetailImage && Boolean((item.capabilities as Record<string, unknown>)?.image_gen))?.modelId ??
    provider.models.find((item) => Boolean((item.capabilities as Record<string, unknown>)?.image_gen))?.modelId ??
    null
  );
}

export async function POST(request: NextRequest) {
  return withProviderCredentials(request, async () => {
    try {
      const input = requestSchema.parse(await request.json());
      const { provider, adapter } = await getProviderAdapter("image");
      const model = chooseImageModel(provider);
      if (!model) {
        throw new Error("当前 Provider 没有可用的图像生成模型，请先在 AI 配置中探测图像接口。");
      }

      const results = [];
      for (const [index, style] of input.styles.entries()) {
        try {
          const result = await adapter.generateImage({
            model,
            prompt: [
              "生成一张电商商品主图，保持商品主体、包装文字、颜色和结构与参考图一致。",
              input.productPrompt ? "商品补充信息：" + input.productPrompt : "",
              "本张主图风格：" + style,
              "画面不要生成无法从参考图确认的规格、功效、认证或数字承诺。",
            ].filter(Boolean).join("\n"),
            aspectRatio: input.aspectRatio,
            referenceImages: input.productImages,
            timeoutMs: 180000,
            monitor: { operation: "hero_batch_generation" },
          });
          results.push({
            index,
            style,
            success: true,
            imageUrl: imageResultToDataUrl(result),
          });
        } catch (error) {
          results.push({
            index,
            style,
            success: false,
            imageUrl: null,
            error: error instanceof Error ? error.message : "主图生成失败",
          });
        }
      }

      return ok({ model, results });
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
