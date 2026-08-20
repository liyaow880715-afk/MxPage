import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { deleteAssetRecord } from "@/lib/storage/asset-manager";
import { handleRouteError, ok } from "@/lib/utils/route";

const removeSchema = z.object({ assetId: z.string().min(1) });

export async function POST(
  request: NextRequest,
  context: { params: { id: string; sectionId: string } },
) {
  try {
    const input = removeSchema.parse(await request.json());
    const section = await prisma.pageSection.findUnique({
      where: { id: context.params.sectionId },
      select: { projectId: true, editableData: true },
    });
    if (!section || section.projectId !== context.params.id) {
      throw new Error("规划模块不存在");
    }

    const asset = await prisma.productAsset.findUnique({ where: { id: input.assetId } });
    if (!asset || asset.projectId !== context.params.id || asset.type !== "REFERENCE") {
      throw new Error("参考图不存在");
    }

    const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
    const currentIds = Array.isArray(editableData.referenceAssetIds)
      ? editableData.referenceAssetIds.filter((item): item is string => typeof item === "string")
      : [];
    const nextIds = currentIds.filter((id) => id !== input.assetId);
    await prisma.pageSection.update({
      where: { id: context.params.sectionId },
      data: { editableData: { ...editableData, referenceAssetIds: nextIds } },
    });
    await deleteAssetRecord(input.assetId);

    return ok({ referenceAssetIds: nextIds });
  } catch (error) {
    return handleRouteError(error);
  }
}
