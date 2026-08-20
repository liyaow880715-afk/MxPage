import { NextRequest } from "next/server";
import { z } from "zod";

import { getProviderAdapter } from "@/lib/services/provider-service";
import { withProviderCredentials } from "@/lib/services/provider-runtime";
import { handleRouteError, ok } from "@/lib/utils/route";
import {
  PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS,
  PRODUCT_ANALYSIS_MAX_IMAGES,
} from "@/lib/utils/product-analysis-image";

const imageSchema = z.string()
  .max(PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS)
  .refine((value) => /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(value), "仅支持 JPG、PNG 或 WebP 图片");

const requestSchema = z.object({
  productImages: z.array(imageSchema).min(1).max(PRODUCT_ANALYSIS_MAX_IMAGES),
});

const outputSchema = z.object({
  productName: z.string().catch(""),
  category: z.string().catch(""),
  material: z.string().catch(""),
  color: z.string().catch(""),
  sellingPoints: z.array(z.string()).catch([]),
  description: z.string().catch(""),
  targetAudience: z.string().catch(""),
  usageScenarios: z.array(z.string()).catch([]),
  numericClaims: z.array(z.string()).catch([]),
  specs: z.array(z.object({
    name: z.string().catch(""),
    description: z.string().catch(""),
    highlights: z.array(z.string()).catch([]),
  })).catch([]),
  imageRoles: z.array(z.string()).catch([]),
}).passthrough();

const systemPrompt = [
  "你是电商商品分析专家。请根据用户提供的一组商品图片输出严格 JSON。",
  "不要输出 markdown，不要编造图片中不可确认的数字、认证、功效、销量或评价。",
  "如果多张图展示不同角度、包装、标签、规格或口味，请综合分析，并按顺序说明 imageRoles。",
  JSON.stringify({
    productName: "商品名称",
    category: "品类",
    material: "材质",
    color: "颜色",
    sellingPoints: ["核心卖点"],
    description: "适合详情页的商品描述",
    targetAudience: "目标人群",
    usageScenarios: ["使用场景"],
    numericClaims: ["图片中明确可见的数字信息"],
    specs: [{ name: "规格/口味", description: "描述", highlights: ["亮点"] }],
    imageRoles: ["主视角/侧面/细节/包装/标签等"],
  }),
].join("\n");

export async function POST(request: NextRequest) {
  return withProviderCredentials(request, async () => {
    try {
      const input = requestSchema.parse(await request.json());
      const { provider, adapter } = await getProviderAdapter();
      const model =
        provider.models.find((item) => item.isDefaultAnalysis && Boolean((item.capabilities as Record<string, unknown>)?.vision))?.modelId ??
        provider.models.find((item) => Boolean((item.capabilities as Record<string, unknown>)?.vision))?.modelId ??
        provider.models.find((item) => Boolean((item.capabilities as Record<string, unknown>)?.text))?.modelId;

      if (!model) {
        throw new Error("当前 Provider 没有可用的文本 / 视觉模型，请先在 AI 配置中探测模型。");
      }

      const result = await adapter.generateStructured({
        model,
        systemPrompt,
        userPrompt: "请分析这 " + input.productImages.length + " 张商品图片，第一张为主要参考图。",
        schema: outputSchema,
        images: input.productImages,
        timeoutMs: 180000,
        monitor: { operation: "standalone_product_analysis" },
      });

      return ok({
        ...result.parsed,
        specs: result.parsed.specs.filter((item) => item.name.trim()),
      });
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
