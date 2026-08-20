import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { saveUploadAsset } from "@/lib/storage/asset-manager";
import { handleRouteError, ok } from "@/lib/utils/route";

const imageSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().regex(/^image\//i, "参考图必须是图片"),
  base64Data: z.string().min(1),
});

const uploadSchema = z.object({
  files: z.array(imageSchema).min(1).max(6),
});

export async function POST(
  request: NextRequest,
  context: { params: { id: string; sectionId: string } },
) {
  try {
    const input = uploadSchema.parse(await request.json());
    const section = await prisma.pageSection.findUnique({
      where: { id: context.params.sectionId },
      select: { projectId: true, editableData: true },
    });
    if (!section || section.projectId !== context.params.id) {
      throw new Error("规划模块不存在");
    }

    const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
    const currentIds = Array.isArray(editableData.referenceAssetIds)
      ? editableData.referenceAssetIds.filter((item): item is string => typeof item === "string")
      : [];
    const existingCount = await prisma.productAsset.count({ where: { projectId: context.params.id } });
    const created = [];
    for (const [index, file] of input.files.entries()) {
      const asset = await saveUploadAsset({
        projectId: context.params.id,
        type: "REFERENCE",
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileBuffer: Buffer.from(file.base64Data, "base64"),
        sortOrder: existingCount + index,
      });
      created.push(asset);
    }

    const nextIds = [...currentIds, ...created.map((asset) => asset.id)].slice(-12);
    await prisma.pageSection.update({
      where: { id: context.params.sectionId },
      data: { editableData: { ...editableData, referenceAssetIds: nextIds } },
    });

    return ok({ assets: created, referenceAssetIds: nextIds }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
